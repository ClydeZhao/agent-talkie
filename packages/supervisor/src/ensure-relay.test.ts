import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureRelayRunning,
  getRelayStatus,
  stopRelay,
} from "./ensure-relay.js";

describe("ensureRelayRunning", () => {
  let dataDir: string | undefined;

  afterEach(async () => {
    if (dataDir !== undefined) {
      await stopRelay({ dataDir }).catch(() => {});
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      dataDir = undefined;
    }
  });

  it("spawns once, reuses live relay, stop clears status", async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-sup-"));

    const first = await ensureRelayRunning({ dataDir, forkTimeoutMs: 15000 });
    expect(first.spawned).toBe(true);
    expect(first.port).toBeGreaterThan(0);
    expect(first.port).toBeLessThanOrEqual(65535);
    expect(first.generation).toMatch(/^[0-9a-f]{32}$/);

    const healthUrl = `http://127.0.0.1:${first.port}/__agent-talkie/v1/health?generation=${encodeURIComponent(first.generation)}`;
    const res = await fetch(healthUrl);
    expect(res.status).toBe(200);

    const second = await ensureRelayRunning({ dataDir });
    expect(second.spawned).toBe(false);
    expect(second.port).toBe(first.port);
    expect(second.generation).toBe(first.generation);

    const stopped = await stopRelay({ dataDir });
    expect(stopped).toEqual({ stopped: true, pid: first.pid });

    const deadline = Date.now() + 5000;
    let status = await getRelayStatus({ dataDir });
    while (status.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      status = await getRelayStatus({ dataDir });
    }
    expect(status.running).toBe(false);
  });
});
