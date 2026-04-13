import { Command } from "commander";
import {
  ensureRelayRunning,
  getRelayStatus,
  stopRelay,
} from "@agent-talkie/supervisor";

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
  .description("List sessions (stub)")
  .action(() => {
    console.log("not implemented (Phase 4)");
  });

await program.parseAsync(process.argv);
