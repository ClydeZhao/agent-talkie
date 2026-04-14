import { Command } from "commander";
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

await program.parseAsync(process.argv);
