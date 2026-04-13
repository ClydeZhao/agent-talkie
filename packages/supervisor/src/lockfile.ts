import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const GENERATION_RE = /^[0-9a-f]{32}$/;

export type RelayLock = {
  pid: number;
  port: number;
  generation: string;
};

function isValidLockBody(value: unknown): value is RelayLock {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const pid = o.pid;
  const port = o.port;
  const generation = o.generation;
  if (typeof generation !== "string" || !GENERATION_RE.test(generation)) {
    return false;
  }
  if (
    typeof pid !== "number" ||
    typeof port !== "number" ||
    !Number.isInteger(pid) ||
    pid <= 0 ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    return false;
  }
  return true;
}

export function readRelayLock(dataDir: string): RelayLock | undefined {
  const lockPath = join(dataDir, "relay.lock");
  if (!existsSync(lockPath)) {
    return undefined;
  }
  try {
    const raw = readFileSync(lockPath, "utf8");
    const parsed: unknown = JSON.parse(raw) as unknown;
    if (!isValidLockBody(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function removeRelayLock(dataDir: string): void {
  const lockPath = join(dataDir, "relay.lock");
  try {
    unlinkSync(lockPath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw e;
    }
  }
}
