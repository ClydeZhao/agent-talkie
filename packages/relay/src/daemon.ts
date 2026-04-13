import { randomBytes } from "node:crypto";
import envPaths from "env-paths";
import {
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRelayServer, DEFAULT_RELAY_PORT } from "./server.js";

const SIGNAL_SHUTDOWN_HARD_CAP_MS = 10000;
const DEFAULT_IDLE_MS = 300000;

function resolveDataDir(): string {
  const override = process.env.AGENT_TALKIE_DATA_DIR?.trim();
  if (override) {
    return override;
  }
  return envPaths("agent-talkie", { suffix: "" }).data;
}

function parseIdleMs(): number {
  const raw = process.env.AGENT_TALKIE_RELAY_IDLE_MS;
  if (raw === undefined || String(raw).trim() === "") {
    return DEFAULT_IDLE_MS;
  }
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 0) {
    return DEFAULT_IDLE_MS;
  }
  return n;
}

function parseListenPort(): number | undefined {
  const raw = process.env.AGENT_TALKIE_RELAY_PORT?.trim();
  if (!raw) {
    return undefined;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    return undefined;
  }
  return n;
}

export async function runRelayDaemon(): Promise<void> {
  const dataDir = resolveDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "relay.sqlite");
  const lockPath = join(dataDir, "relay.lock");
  const generation = randomBytes(16).toString("hex");
  const idleMs = parseIdleMs();
  const parsedPort = parseListenPort();

  let closeRelay!: () => Promise<void>;
  const handle = await createRelayServer({
    dbPath,
    ...(parsedPort !== undefined ? { port: parsedPort } : {}),
    relayGenerationToken: generation,
    idleShutdownMs: idleMs,
    onIdleShutdown: async () => {
      await closeRelay();
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
      process.exit(0);
    },
  });
  closeRelay = handle.close;

  const bound = new URL(handle.url);
  const port =
    bound.port !== "" ? Number(bound.port) : DEFAULT_RELAY_PORT;
  const lockBody = JSON.stringify({
    pid: process.pid,
    port,
    generation,
  });
  const tmpPath = join(dataDir, "relay.lock.tmp");
  writeFileSync(tmpPath, lockBody, "utf8");
  renameSync(tmpPath, lockPath);

  if (typeof process.send === "function") {
    process.send({
      type: "relay.ready",
      v: 1,
      port,
      generation,
      pid: process.pid,
    });
  }

  let shuttingDown = false;
  const onSignal = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const killTimer = setTimeout(() => {
      process.exit(1);
    }, SIGNAL_SHUTDOWN_HARD_CAP_MS);
    void closeRelay().finally(() => {
      clearTimeout(killTimer);
      try {
        unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && entry === fileURLToPath(import.meta.url)) {
  void runRelayDaemon().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
