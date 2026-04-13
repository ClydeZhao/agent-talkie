import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readRelayLock, removeRelayLock } from "./lockfile.js";
import { classifyRelayLock } from "./liveness.js";
import { resolveAgentTalkieDataDir } from "./paths.js";

const require = createRequire(import.meta.url);

type RelayReadyMessage = {
  type: string;
  v?: unknown;
  port?: unknown;
  generation?: unknown;
  pid?: unknown;
};

function isValidRelayReady(m: unknown): m is {
  type: "relay.ready";
  v: 1;
  port: number;
  generation: string;
  pid: number;
} {
  if (typeof m !== "object" || m === null) {
    return false;
  }
  const o = m as RelayReadyMessage;
  return (
    o.type === "relay.ready" &&
    o.v === 1 &&
    Number.isInteger(o.port) &&
    (o.port as number) > 0 &&
    (o.port as number) <= 65535 &&
    typeof o.generation === "string" &&
    /^[0-9a-f]{32}$/.test(o.generation) &&
    Number.isInteger(o.pid) &&
    (o.pid as number) > 0
  );
}

export type EnsureRelayOptions = {
  dataDir?: string;
  forkTimeoutMs?: number;
};

export async function ensureRelayRunning(
  opts?: EnsureRelayOptions,
): Promise<{
  port: number;
  generation: string;
  pid: number;
  spawned: boolean;
}> {
  const dataDir = resolveAgentTalkieDataDir(opts?.dataDir);
  const lockPath = join(dataDir, "relay.lock");
  const forkTimeoutMs = opts?.forkTimeoutMs ?? 15000;

  if (existsSync(lockPath)) {
    const parsed = readRelayLock(dataDir);
    if (parsed === undefined) {
      removeRelayLock(dataDir);
    } else if ((await classifyRelayLock(parsed)) === "live") {
      return {
        port: parsed.port,
        generation: parsed.generation,
        pid: parsed.pid,
        spawned: false,
      };
    } else {
      removeRelayLock(dataDir);
    }
  }

  const daemonEntry = require.resolve("@agent-talkie/relay/daemon");
  const child = fork(daemonEntry, [], {
    env: { ...process.env, AGENT_TALKIE_DATA_DIR: dataDir },
    // Do not inherit parent stdout/stderr: a piped parent (e.g. spawnSync in tests)
    // would deadlock while the daemon keeps those descriptors open.
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    execArgv: [],
  });

  const firstMessage = new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error("relay fork timeout: no relay.ready message"));
    }, forkTimeoutMs);
    child.once("message", (m: unknown) => {
      clearTimeout(t);
      resolve(m);
    });
    child.once("error", (err: Error) => {
      clearTimeout(t);
      reject(err);
    });
  });

  let message: unknown;
  try {
    message = await firstMessage;
  } catch (e) {
    child.kill("SIGKILL");
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`relay fork timeout: ${detail}`);
  }

  if (!isValidRelayReady(message)) {
    child.kill("SIGKILL");
    throw new Error("invalid relay.ready: message failed schema validation");
  }

  if (child.connected) {
    child.disconnect();
  }
  // Allow the parent Node process (e.g. `talkie relay start`) to exit while the
  // detached relay daemon keeps running; otherwise the fork keeps the loop alive.
  child.unref();

  return {
    port: message.port,
    generation: message.generation,
    pid: message.pid,
    spawned: true,
  };
}

export type StopRelayOptions = {
  dataDir?: string;
  signal?: NodeJS.Signals;
};

export type StopRelayResult =
  | { stopped: false; reason: "no_lock" | "stale_lock_removed" | "kill_failed" }
  | { stopped: true; pid: number };

export async function stopRelay(
  opts?: StopRelayOptions,
): Promise<StopRelayResult> {
  const dataDir = resolveAgentTalkieDataDir(opts?.dataDir);
  const lockPath = join(dataDir, "relay.lock");
  const signal = opts?.signal ?? "SIGTERM";

  if (!existsSync(lockPath)) {
    return { stopped: false, reason: "no_lock" };
  }

  const lock = readRelayLock(dataDir);
  if (lock === undefined) {
    removeRelayLock(dataDir);
    return { stopped: false, reason: "stale_lock_removed" };
  }

  if ((await classifyRelayLock(lock)) === "stale") {
    removeRelayLock(dataDir);
    return { stopped: false, reason: "stale_lock_removed" };
  }

  try {
    process.kill(lock.pid, signal);
  } catch {
    return { stopped: false, reason: "kill_failed" };
  }

  return { stopped: true, pid: lock.pid };
}

export type RelayStatus =
  | { running: false; reason: "no_lock" }
  | {
      running: false;
      reason: "stale";
      port?: number;
      pid?: number;
      generation?: string;
    }
  | { running: true; port: number; pid: number; generation: string };

export async function getRelayStatus(opts?: {
  dataDir?: string;
}): Promise<RelayStatus> {
  const dataDir = resolveAgentTalkieDataDir(opts?.dataDir);
  const lockPath = join(dataDir, "relay.lock");

  if (!existsSync(lockPath)) {
    return { running: false, reason: "no_lock" };
  }

  const lock = readRelayLock(dataDir);
  if (lock === undefined) {
    return { running: false, reason: "stale" };
  }

  if ((await classifyRelayLock(lock)) === "stale") {
    return {
      running: false,
      reason: "stale",
      port: lock.port,
      pid: lock.pid,
      generation: lock.generation,
    };
  }

  return {
    running: true,
    port: lock.port,
    pid: lock.pid,
    generation: lock.generation,
  };
}
