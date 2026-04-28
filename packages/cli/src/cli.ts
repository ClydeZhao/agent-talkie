import { Command } from "commander";
import openUrl from "open";
import {
  ensureRelayRunning,
  getRelayStatus,
  stopRelay,
} from "@agent-talkie/supervisor";
import {
  runSpaceStatus,
  runTranscriptCommand,
  runWhoCommand,
} from "./oversight/static-commands.js";
import { runWatch } from "./oversight/watch.js";
import {
  runJoinCommand,
  runPullCommand,
  runSendCommand,
} from "./session-commands.js";

function parseWatchRefreshMs(raw: string | undefined): number {
  const defaultMs = 1000;
  if (raw === undefined || raw === "") {
    return defaultMs;
  }
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) {
    console.error("[talkie-watch] --refresh-ms must be a valid integer");
    process.exit(1);
  }
  if (n > 60000) {
    console.error("[talkie-watch] --refresh-ms must be at most 60000");
    process.exit(1);
  }
  return Math.min(60000, Math.max(1, n));
}

function handleError(err: unknown): void {
  console.error(err);
  process.exitCode = 1;
}

const program = new Command();
program.name("talkie");
program.description("agent-talkie CLI");

const relayCmd = program.command("relay");

async function relayStartOrEnsure(): Promise<void> {
  const r = await ensureRelayRunning({});
  console.log(`relay port=${r.port} spawned=${r.spawned}`);
}

relayCmd
  .command("start")
  .description("Ensure relay is running (spawn if needed)")
  .action(async () => {
    try {
      await relayStartOrEnsure();
    } catch (e) {
      handleError(e);
    }
  });

relayCmd
  .command("ensure")
  .description("Idempotent ensure relay is running")
  .action(async () => {
    try {
      await relayStartOrEnsure();
    } catch (e) {
      handleError(e);
    }
  });

relayCmd
  .command("stop")
  .description("Stop relay for default data directory")
  .action(async () => {
    try {
      const r = await stopRelay({});
      console.log(JSON.stringify(r));
    } catch (e) {
      handleError(e);
    }
  });

relayCmd
  .command("status")
  .description("Relay status for default data directory")
  .action(async () => {
    try {
      const r = await getRelayStatus({});
      console.log(JSON.stringify(r));
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("ping")
  .description("Ensure relay and check health endpoint")
  .action(async () => {
    try {
      const { port, generation } = await ensureRelayRunning({});
      const url = `http://127.0.0.1:${port}/__agent-talkie/v1/health?generation=${encodeURIComponent(generation)}`;
      const res = await fetch(url);
      if (!res.ok) {
        process.exitCode = 1;
        return;
      }
      console.log(`ping ok port=${port}`);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("dashboard")
  .description("Ensure relay is running and open the web dashboard")
  .option("--space <slug>", "Open a specific space")
  .option("--no-open", "Print URL only; do not open a browser")
  .action(async (opts: { open?: boolean; space?: string }) => {
    try {
      const { port } = await ensureRelayRunning({});
      const suffix =
        typeof opts.space === "string" && opts.space.trim() !== ""
          ? `?space=${encodeURIComponent(opts.space.trim())}`
          : "";
      const url = `http://127.0.0.1:${port}/dashboard${suffix}`;
      console.log(url);
      if (opts.open !== false) {
        await openUrl(url);
      }
    } catch (e) {
      handleError(e);
    }
  });

const sessionCmd = program.command("session");
sessionCmd
  .command("list")
  .description("List sessions (redirect)")
  .action(() => {
    console.error("Use: talkie who --slug <slug>");
  });

const spaceCmd = program.command("space");
spaceCmd
  .command("status")
  .description("Print oversight JSON summary for a space (includes ownerSessionId)")
  .requiredOption("--slug <slug>", "space slug")
  .action(async (opts: { slug: string }) => {
    try {
      await runSpaceStatus(opts.slug);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("join")
  .description("Join or create a collaboration space as a local CLI session")
  .requiredOption("--slug <slug>", "space slug")
  .requiredOption("--name <name>", "local session display name")
  .requiredOption("--runtime <runtime>", "runtime label")
  .option("--workspace <label>", "workspace label")
  .action(async (opts: {
    slug: string;
    name: string;
    runtime: string;
    workspace?: string;
  }) => {
    try {
      await runJoinCommand(opts);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("send")
  .description("Send a conversation message from the current local CLI session")
  .requiredOption("--slug <slug>", "space slug")
  .option("--to <session>", "target session id or display name")
  .option("--name <name>", "select a joined local session by display name")
  .option("--runtime <runtime>", "select a joined local session by runtime")
  .option("--workspace <label>", "select a joined local session by workspace label")
  .argument("<message>", "message text")
  .action(async (message: string, opts: {
    slug: string;
    to?: string;
    name?: string;
    runtime?: string;
    workspace?: string;
  }) => {
    try {
      await runSendCommand(message, opts);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("pull")
  .description("Pull inbound messages for the current local CLI session")
  .requiredOption("--slug <slug>", "space slug")
  .option("--name <name>", "select a joined local session by display name")
  .option("--runtime <runtime>", "select a joined local session by runtime")
  .option("--workspace <label>", "select a joined local session by workspace label")
  .option("--clear", "advance the local cursor past returned messages")
  .option(
    "--limit <n>",
    "max messages (default 20, max 100)",
    (raw: string) => {
      const n = parseInt(String(raw), 10);
      if (Number.isNaN(n)) {
        return 20;
      }
      return Math.min(100, Math.max(1, n));
    },
    20,
  )
  .action(async (opts: {
    slug: string;
    name?: string;
    runtime?: string;
    workspace?: string;
    clear?: boolean;
    limit: number;
  }) => {
    try {
      await runPullCommand(opts);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("transcript")
  .description(
    "Print recent transcript entries as JSON. Does not inject messages into agent sessions.",
  )
  .requiredOption("--slug <slug>", "space slug")
  .option(
    "--limit <n>",
    "max entries (default 50, max 500)",
    (raw: string) => {
      const n = parseInt(String(raw), 10);
      if (Number.isNaN(n)) {
        return 50;
      }
      return Math.min(500, Math.max(1, n));
    },
    50,
  )
  .action(async (opts: { slug: string; limit: number }) => {
    try {
      await runTranscriptCommand(opts.slug, opts.limit);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("who")
  .description(
    "List space members as TSV (session_id, display_name, is_human, role, progress)",
  )
  .requiredOption("--slug <slug>", "space slug")
  .action(async (opts: { slug: string }) => {
    try {
      await runWhoCommand(opts.slug);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("watch")
  .description(
    "Live split-pane oversight (participants + timeline). Requires relay and space.",
  )
  .requiredOption("--slug <slug>", "space slug")
  .option(
    "--refresh-ms <n>",
    "full redraw interval in ms (default 1000, max 60000)",
    "1000",
  )
  .action(async (opts: { slug: string; refreshMs: string }) => {
    try {
      const refreshMs = parseWatchRefreshMs(opts.refreshMs);
      await runWatch({ slug: opts.slug, refreshMs });
    } catch (e) {
      handleError(e);
    }
  });

await program.parseAsync(process.argv);
