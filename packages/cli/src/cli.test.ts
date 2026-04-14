import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, "..", "dist", "cli.js");

function runCli(
  args: string[],
  extraEnv?: Record<string, string>,
): ReturnType<typeof spawnSync<string>> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

describe("talkie CLI", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir !== undefined) {
      runCli(["relay", "stop"], { AGENT_TALKIE_DATA_DIR: dataDir });
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      dataDir = undefined;
    }
  });

  it("session list redirects to who --slug", () => {
    const r = runCli(["session", "list"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(r.stderr.trim()).toBe("Use: talkie who --slug <slug>");
  });

  it("relay start then ping with isolated data dir", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      /** Ephemeral port so tests pass when 18765 is already in use locally. */
      AGENT_TALKIE_RELAY_PORT: "0",
    };
    const start = runCli(["relay", "start"], env);
    expect(start.status).toBe(0);
    expect(start.stdout.trim()).toMatch(/^relay port=\d+ spawned=(true|false)$/);

    const ping = runCli(["ping"], env);
    expect(ping.status).toBe(0);
    expect(ping.stdout.trim()).toMatch(/^ping ok port=\d+$/);
  });
});
