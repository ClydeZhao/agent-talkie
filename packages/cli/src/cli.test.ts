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

  it("oversight commands on fresh data dir return 'space not found' without SqliteError", () => {
    const freshDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-oversight-"),
    );
    const env = { AGENT_TALKIE_DATA_DIR: freshDir };

    try {
      const who = runCli(["who", "--slug", "fresh-oversight-slug"], env);
      expect(who.status).toBe(1);
      expect(who.stderr).toContain("space not found: fresh-oversight-slug");
      expect(who.stderr).not.toContain("SqliteError");
      expect(who.stderr).not.toContain("no such table");

      const status = runCli(
        ["space", "status", "--slug", "fresh-oversight-slug"],
        env,
      );
      expect(status.status).toBe(1);
      expect(status.stderr).toContain("space not found: fresh-oversight-slug");
      expect(status.stderr).not.toContain("SqliteError");
      expect(status.stderr).not.toContain("no such table");

      const transcript = runCli(
        ["transcript", "--slug", "fresh-oversight-slug", "--limit", "5"],
        env,
      );
      expect(transcript.status).toBe(1);
      expect(transcript.stderr).toContain(
        "space not found: fresh-oversight-slug",
      );
      expect(transcript.stderr).not.toContain("SqliteError");
      expect(transcript.stderr).not.toContain("no such table");
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
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

  it("dashboard --no-open prints dashboard URL with isolated data dir", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      /** Ephemeral port so tests pass when 18765 is already in use locally. */
      AGENT_TALKIE_RELAY_PORT: "0",
    };
    const dash = runCli(["dashboard", "--no-open"], env);
    expect(dash.status).toBe(0);
    expect(dash.stdout.trim()).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/dashboard$/,
    );
  });
});
