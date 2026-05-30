import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

const validSkill = `---
name: talkie-space
description: "Use Agent Talkie spaces"
---

# Talkie Space
`;

describe("talkie CLI", () => {
  let dataDir: string | undefined;
  let projectRootDir: string | undefined;

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
    if (projectRootDir !== undefined) {
      try {
        rmSync(projectRootDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      projectRootDir = undefined;
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

    const dashSpace = runCli(
      ["dashboard", "--space", "my space", "--no-open"],
      env,
    );
    expect(dashSpace.status).toBe(0);
    expect(dashSpace.stdout.trim()).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/dashboard\?space=my%20space$/,
    );
  });

  it("doctor verifies relay, dashboard, CLI, data dir, skill templates, and Cursor MCP config", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-doctor-"));
    projectRootDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-doctor-project-root-"),
    );
    mkdirSync(path.join(projectRootDir, ".codex", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".cursor", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".claude", "skills", "talkie-space"), {
      recursive: true,
    });
    writeFileSync(
      path.join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".cursor", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".claude", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "agent-talkie": {
            type: "stdio",
            command: "talkie-cursor-mcp",
          },
        },
      }),
    );
    writeFileSync(
      path.join(projectRootDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "agent-talkie": {
            type: "stdio",
            command: "talkie-claude-mcp",
            args: [],
          },
        },
      }),
    );
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const doctor = runCli(["doctor", "--project-root", projectRootDir], env);
    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: {
        relay: { ok: boolean; url: string };
        dashboard: { ok: boolean; url: string };
        cli: { ok: boolean; path: string };
        dataDir: { ok: boolean; path: string };
        codexSkillTemplate: { ok: boolean; path: string };
        cursorSkillTemplate: { ok: boolean; path: string };
        claudeSkillTemplate: { ok: boolean; path: string };
        cursorMcpConfig: { ok: boolean; path: string; status: string };
        claudeMcpConfig: { ok: boolean; path: string; status: string };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.checks.relay).toMatchObject({ ok: true });
    expect(payload.checks.relay.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/__agent-talkie\/v1\/health/,
    );
    expect(payload.checks.dashboard).toMatchObject({ ok: true });
    expect(payload.checks.dashboard.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/dashboard$/,
    );
    expect(payload.checks.cli).toMatchObject({ ok: true, path: cliPath });
    expect(payload.checks.dataDir).toMatchObject({ ok: true, path: dataDir });
    expect(payload.checks.codexSkillTemplate).toMatchObject({
      ok: true,
      path: path.join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
      status: "configured",
    });
    expect(payload.checks.cursorSkillTemplate).toMatchObject({
      ok: true,
      path: path.join(projectRootDir, ".cursor", "skills", "talkie-space", "SKILL.md"),
      status: "configured",
    });
    expect(payload.checks.claudeSkillTemplate).toMatchObject({
      ok: true,
      path: path.join(projectRootDir, ".claude", "skills", "talkie-space", "SKILL.md"),
      status: "configured",
    });
    expect(payload.checks.cursorMcpConfig).toMatchObject({
      ok: true,
      path: path.join(projectRootDir, ".cursor", "mcp.json"),
      status: "configured",
    });
    expect(payload.checks.claudeMcpConfig).toMatchObject({
      ok: true,
      path: path.join(projectRootDir, ".mcp.json"),
      status: "configured",
    });

    const workspaceAlias = runCli(
      ["doctor", "--workspace", "--project-root", projectRootDir],
      env,
    );
    expect(workspaceAlias.status).toBe(0);
    expect(JSON.parse(workspaceAlias.stdout) as { ok: boolean }).toMatchObject({
      ok: true,
    });
  });

  it("doctor accepts the durable Cursor MCP wrapper installed by agent-talkie", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-doctor-wrapper-"));
    projectRootDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-doctor-wrapper-project-root-"),
    );
    mkdirSync(path.join(projectRootDir, ".codex", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".cursor", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".claude", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".agent-talkie", "bin"), {
      recursive: true,
    });
    writeFileSync(
      path.join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".cursor", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".claude", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    const wrapperPath = path.join(
      projectRootDir,
      ".agent-talkie",
      "bin",
      "talkie-cursor-mcp",
    );
    const claudeWrapperPath = path.join(
      projectRootDir,
      ".agent-talkie",
      "bin",
      "talkie-claude-mcp",
    );
    writeFileSync(wrapperPath, "#!/bin/sh\nexit 0\n");
    writeFileSync(claudeWrapperPath, "#!/bin/sh\nexit 0\n");
    chmodSync(wrapperPath, 0o755);
    chmodSync(claudeWrapperPath, 0o755);
    writeFileSync(
      path.join(projectRootDir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "agent-talkie": {
            type: "stdio",
            command: wrapperPath,
          },
        },
      }),
    );
    writeFileSync(
      path.join(projectRootDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "agent-talkie": {
            type: "stdio",
            command: claudeWrapperPath,
            args: [],
          },
        },
      }),
    );
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const doctor = runCli(["doctor", "--project-root", projectRootDir], env);
    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: {
        cursorMcpConfig: { ok: boolean; status: string };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.checks.cursorMcpConfig).toMatchObject({
      ok: true,
      status: "configured",
    });
  });

  it("doctor rejects skill templates without YAML frontmatter", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-doctor-skill-"));
    projectRootDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-doctor-skill-project-root-"),
    );
    mkdirSync(path.join(projectRootDir, ".codex", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".cursor", "skills", "talkie-space"), {
      recursive: true,
    });
    writeFileSync(
      path.join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
      "# Talkie Space\n",
    );
    writeFileSync(
      path.join(projectRootDir, ".cursor", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          "agent-talkie": {
            type: "stdio",
            command: "talkie-cursor-mcp",
          },
        },
      }),
    );

    const doctor = runCli(
      ["doctor", "--project-root", projectRootDir, "--no-start-relay"],
      {
        AGENT_TALKIE_DATA_DIR: dataDir,
        AGENT_TALKIE_RELAY_PORT: "0",
      },
    );
    expect(doctor.status).toBe(1);
    const payload = JSON.parse(doctor.stdout) as {
      checks: {
        codexSkillTemplate: { ok: boolean; status: string };
        cursorSkillTemplate: { ok: boolean; status: string };
      };
    };
    expect(payload.checks.codexSkillTemplate).toMatchObject({
      ok: false,
      status: "invalid_frontmatter",
    });
    expect(payload.checks.cursorSkillTemplate).toMatchObject({
      ok: true,
      status: "configured",
    });
  });

  it("doctor reports a missing Cursor MCP config without starting relay when requested", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-doctor-missing-"));
    projectRootDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-doctor-missing-project-root-"),
    );
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const doctor = runCli(
      ["doctor", "--project-root", projectRootDir, "--no-start-relay"],
      env,
    );
    expect(doctor.status).toBe(1);
    const payload = JSON.parse(doctor.stdout) as {
      ok: boolean;
      checks: {
        relay: { ok: boolean; status: string };
        cursorMcpConfig: { ok: boolean; status: string };
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.checks.relay).toMatchObject({
      ok: false,
      status: "not_running",
    });
    expect(payload.checks.cursorMcpConfig).toMatchObject({
      ok: false,
      status: "missing",
    });
  });

  it("doctor scopes runtime checks from the install manifest for partial installs", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-doctor-partial-"));
    projectRootDir = mkdtempSync(
      path.join(os.tmpdir(), "agent-talkie-cli-doctor-partial-project-root-"),
    );
    mkdirSync(path.join(projectRootDir, ".codex", "skills", "talkie-space"), {
      recursive: true,
    });
    mkdirSync(path.join(projectRootDir, ".agent-talkie"), {
      recursive: true,
    });
    writeFileSync(
      path.join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
      validSkill,
    );
    writeFileSync(
      path.join(projectRootDir, ".agent-talkie", "install-manifest.json"),
      JSON.stringify({
        files: [
          {
            kind: "talkie-bin",
            path: path.join(projectRootDir, ".agent-talkie", "bin", "talkie"),
          },
          {
            kind: "codex-skill",
            path: path.join(
              projectRootDir,
              ".codex",
              "skills",
              "talkie-space",
              "SKILL.md",
            ),
          },
        ],
      }),
    );

    const doctor = runCli(
      ["doctor", "--project-root", projectRootDir, "--no-start-relay"],
      {
        AGENT_TALKIE_DATA_DIR: dataDir,
        AGENT_TALKIE_RELAY_PORT: "0",
      },
    );
    expect(doctor.status).toBe(1);
    const payload = JSON.parse(doctor.stdout) as {
      checks: {
        codexSkillTemplate: { ok: boolean; status: string };
        cursorSkillTemplate: { ok: boolean; status: string };
        cursorMcpConfig: { ok: boolean; status: string };
        claudeSkillTemplate: { ok: boolean; status: string };
        claudeMcpConfig: { ok: boolean; status: string };
      };
    };
    expect(payload.checks.codexSkillTemplate).toMatchObject({
      ok: true,
      status: "configured",
    });
    expect(payload.checks.cursorSkillTemplate).toMatchObject({
      ok: true,
      status: "skipped",
    });
    expect(payload.checks.cursorMcpConfig).toMatchObject({
      ok: true,
      status: "skipped",
    });
    expect(payload.checks.claudeSkillTemplate).toMatchObject({
      ok: true,
      status: "skipped",
    });
    expect(payload.checks.claudeMcpConfig).toMatchObject({
      ok: true,
      status: "skipped",
    });
  });

  it("join creates a space and reuses the same local CLI session identity", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-join-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const first = runCli(
      [
        "join",
        "--slug",
        "cli-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
        "--workspace-label",
        "repo",
      ],
      env,
    );
    expect(first.status).toBe(0);
    const firstPayload = JSON.parse(first.stdout) as {
      ok: boolean;
      slug: string;
      sessionId: string;
      displayName: string;
    };
    expect(firstPayload).toMatchObject({
      ok: true,
      slug: "cli-room",
      displayName: "codex-one",
    });

    const second = runCli(
      [
        "join",
        "--slug",
        "cli-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
        "--workspace-label",
        "repo",
      ],
      env,
    );
    expect(second.status).toBe(0);
    const secondPayload = JSON.parse(second.stdout) as {
      sessionId: string;
      displayName: string;
    };
    expect(secondPayload.sessionId).toBe(firstPayload.sessionId);
    expect(secondPayload.displayName).toBe("codex-one");

    const who = runCli(["who", "--slug", "cli-room"], env);
    expect(who.status).toBe(0);
    const memberLines = who.stdout.trim().split("\n").slice(1);
    expect(memberLines).toHaveLength(1);
    expect(memberLines[0]).toContain(firstPayload.sessionId);
    expect(memberLines[0]).toContain("codex-one");
  });

  it("create-space creates an unnamed product space, assigns creator orchestrator, and emits a join prompt", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-create-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const created = runCli(
      [
        "create-space",
        "--name",
        "codex-lead",
        "--runtime",
        "codex-cli",
        "--workspace-label",
        "repo",
        "--no-open",
      ],
      env,
    );
    expect(created.status).toBe(0);
    const payload = JSON.parse(created.stdout) as {
      ok: boolean;
      slug: string;
      label: string;
      spaceId: string;
      sessionId: string;
      orchestratorSessionId: string | null;
      dashboardUrl: string;
      joinPrompt: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.slug).toMatch(/^talkie-[a-z0-9]+-[a-f0-9-]+$/);
    expect(payload.label).toMatch(/^Talkie Space \d{4}-\d{2}-\d{2} /);
    expect(payload.label).not.toContain(payload.slug);
    expect(payload.orchestratorSessionId).toBe(payload.sessionId);
    expect(payload.dashboardUrl).toMatch(
      new RegExp(`/dashboard\\?space=${payload.slug}$`),
    );
    expect(payload.joinPrompt).toContain(`Space slug: ${payload.slug}`);

    const status = runCli(["space", "status", "--slug", payload.slug], env);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      slug: payload.slug,
      label: payload.label,
      orchestratorSessionId: payload.sessionId,
    });
  });

  it("create-space can opt out of default orchestrator assignment", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-create-no-orch-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const created = runCli(
      [
        "create-space",
        "--name",
        "codex-worker",
        "--runtime",
        "codex-cli",
        "--no-orchestrator",
        "--no-open",
      ],
      env,
    );
    expect(created.status).toBe(0);
    const payload = JSON.parse(created.stdout) as {
      slug: string;
      orchestratorSessionId: string | null;
    };
    expect(payload.orchestratorSessionId).toBeNull();

    const status = runCli(["space", "status", "--slug", payload.slug], env);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      slug: payload.slug,
      orchestratorSessionId: null,
    });
  });

  it("list-active-spaces exposes product labels/status and join-from-prompt joins the referenced space", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-product-join-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const created = runCli(
      [
        "create-space",
        "--name",
        "codex-lead",
        "--runtime",
        "codex-cli",
        "--no-open",
      ],
      env,
    );
    expect(created.status).toBe(0);
    const payload = JSON.parse(created.stdout) as {
      slug: string;
      label: string;
      joinPrompt: string;
    };

    const list = runCli(["list-active-spaces"], env);
    expect(list.status).toBe(0);
    const listed = JSON.parse(list.stdout) as {
      spaces: Array<{ slug: string; label: string; status: string }>;
    };
    expect(listed.spaces).toContainEqual(
      expect.objectContaining({
        slug: payload.slug,
        label: payload.label,
        status: "active",
      }),
    );

    const joined = runCli(
      [
        "join-from-prompt",
        "--prompt",
        payload.joinPrompt,
        "--name",
        "cursor-worker",
        "--runtime",
        "cursor-app",
      ],
      env,
    );
    expect(joined.status).toBe(0);
    expect(JSON.parse(joined.stdout)).toMatchObject({
      ok: true,
      slug: payload.slug,
      displayName: "cursor-worker",
    });
  });

  it("join-from-prompt rejects stale prompts instead of creating a new space", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-stale-prompt-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const joined = runCli(
      [
        "join-from-prompt",
        "--prompt",
        "Join this local Agent Talkie Space.\nSpace label: Missing\nSpace slug: missing-room",
        "--name",
        "cursor-worker",
        "--runtime",
        "cursor-app",
      ],
      env,
    );

    expect(joined.status).toBe(1);
    expect(joined.stderr).toContain(
      "Join prompt references a space that is not active locally: missing-room",
    );

    const list = runCli(["list-active-spaces"], env);
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toMatchObject({ spaces: [] });
  });

  it("send reuses the selected CLI session and pull returns inbound messages once cleared", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-msg-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const recipientJoin = runCli(
      [
        "join",
        "--slug",
        "cli-msg-room",
        "--name",
        "cursor-one",
        "--runtime",
        "cursor-cli",
      ],
      env,
    );
    expect(recipientJoin.status).toBe(0);
    const recipient = JSON.parse(recipientJoin.stdout) as {
      sessionId: string;
    };

    const senderJoin = runCli(
      [
        "join",
        "--slug",
        "cli-msg-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
      ],
      env,
    );
    expect(senderJoin.status).toBe(0);
    const sender = JSON.parse(senderJoin.stdout) as { sessionId: string };

    const send = runCli(
      ["send", "--slug", "cli-msg-room", "hello from codex", "--to", "cursor-one"],
      env,
    );
    expect(send.status).toBe(0);
    expect(JSON.parse(send.stdout)).toMatchObject({
      ok: true,
      slug: "cli-msg-room",
      to: recipient.sessionId,
    });

    const reselectRecipient = runCli(
      [
        "join",
        "--slug",
        "cli-msg-room",
        "--name",
        "cursor-one",
        "--runtime",
        "cursor-cli",
      ],
      env,
    );
    expect(reselectRecipient.status).toBe(0);

    const pull = runCli(
      ["pull", "--slug", "cli-msg-room", "--clear", "--limit", "10"],
      env,
    );
    expect(pull.status).toBe(0);
    const pulled = JSON.parse(pull.stdout) as {
      count: number;
      items: Array<{
        envelope: {
          sessionId: string;
          type: string;
          to?: string;
          payload: { text?: string };
        };
      }>;
    };
    expect(pulled.count).toBe(1);
    expect(pulled.items[0]?.envelope).toMatchObject({
      sessionId: sender.sessionId,
      type: "chat.message",
      to: recipient.sessionId,
      payload: { text: "hello from codex" },
    });

    const secondPull = runCli(
      ["pull", "--slug", "cli-msg-room", "--clear", "--limit", "10"],
      env,
    );
    expect(secondPull.status).toBe(0);
    expect(JSON.parse(secondPull.stdout)).toMatchObject({
      count: 0,
      items: [],
    });
  });

  it("send and pull can select a joined CLI session without relying on global current state", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-select-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const recipientJoin = runCli(
      [
        "join",
        "--slug",
        "cli-select-room",
        "--name",
        "cursor-one",
        "--runtime",
        "cursor-cli",
      ],
      env,
    );
    expect(recipientJoin.status).toBe(0);
    const recipient = JSON.parse(recipientJoin.stdout) as { sessionId: string };

    const senderJoin = runCli(
      [
        "join",
        "--slug",
        "cli-select-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
      ],
      env,
    );
    expect(senderJoin.status).toBe(0);
    const sender = JSON.parse(senderJoin.stdout) as { sessionId: string };

    const reselectRecipient = runCli(
      [
        "join",
        "--slug",
        "cli-select-room",
        "--name",
        "cursor-one",
        "--runtime",
        "cursor-cli",
      ],
      env,
    );
    expect(reselectRecipient.status).toBe(0);

    const send = runCli(
      [
        "send",
        "--slug",
        "cli-select-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
        "--to",
        "cursor-one",
        "selected sender message",
      ],
      env,
    );
    expect(send.status).toBe(0);

    const pull = runCli(
      [
        "pull",
        "--slug",
        "cli-select-room",
        "--name",
        "cursor-one",
        "--runtime",
        "cursor-cli",
        "--clear",
      ],
      env,
    );
    expect(pull.status).toBe(0);
    const pulled = JSON.parse(pull.stdout) as {
      count: number;
      items: Array<{
        envelope: {
          sessionId: string;
          to?: string;
          payload: { text?: string };
        };
      }>;
    };
    expect(pulled.count).toBe(1);
    expect(pulled.items[0]?.envelope).toMatchObject({
      sessionId: sender.sessionId,
      to: recipient.sessionId,
      payload: { text: "selected sender message" },
    });
  });

  it("defaults workspace label metadata to a basename and restricts local session state permissions", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-state-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const joined = runCli(
      [
        "join",
        "--slug",
        "cli-state-room",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
      ],
      env,
    );
    expect(joined.status).toBe(0);
    const payload = JSON.parse(joined.stdout) as { workspaceLabel: string };
    expect(payload.workspaceLabel).toBe(path.basename(process.cwd()));
    expect(payload.workspaceLabel).not.toContain(path.sep);

    const mode = statSync(path.join(dataDir, "cli-session-state.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("requires the selected CLI session to explicitly join before send or pull", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-explicit-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };

    const roomA = runCli(
      [
        "join",
        "--slug",
        "room-a",
        "--name",
        "codex-one",
        "--runtime",
        "codex-cli",
      ],
      env,
    );
    expect(roomA.status).toBe(0);

    const sendOther = runCli(["send", "--slug", "room-b", "not joined"], env);
    expect(sendOther.status).toBe(1);
    expect(sendOther.stderr).toContain(
      "Current CLI session has not joined space room-b",
    );

    const pullOther = runCli(["pull", "--slug", "room-b"], env);
    expect(pullOther.status).toBe(1);
    expect(pullOther.stderr).toContain(
      "Current CLI session has not joined space room-b",
    );
  });

  it("rejects pull when stale local state claims a slug without active membership", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-stale-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };
    const statePath = path.join(dataDir, "cli-session-state.json");

    const alpha = runCli(
      ["join", "--slug", "room-a", "--name", "alpha", "--runtime", "codex-cli"],
      env,
    );
    expect(alpha.status).toBe(0);
    const alphaState = JSON.parse(readFileSync(statePath, "utf8")) as {
      currentKey: string;
      sessions: Record<string, { slug: string }>;
    };
    const alphaKey = alphaState.currentKey;
    expect(alphaKey).toBeDefined();

    const beta = runCli(
      ["join", "--slug", "room-b", "--name", "beta", "--runtime", "cursor-app"],
      env,
    );
    expect(beta.status).toBe(0);
    const betaSend = runCli(["send", "--slug", "room-b", "room-b broadcast"], env);
    expect(betaSend.status).toBe(0);

    const staleState = JSON.parse(readFileSync(statePath, "utf8")) as {
      currentKey: string;
      sessions: Record<string, { slug: string }>;
    };
    staleState.currentKey = alphaKey!;
    staleState.sessions[alphaKey!]!.slug = "room-b";
    writeFileSync(statePath, JSON.stringify(staleState), "utf8");

    const stalePull = runCli(["pull", "--slug", "room-b"], env);
    expect(stalePull.status).toBe(1);
    expect(stalePull.stderr).toContain(
      "Current CLI session has not joined space room-b",
    );
  });

  it("sends with the fresh session id after persisted credentials are rejected", () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "agent-talkie-cli-resume-"));
    const env = {
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: "0",
    };
    const statePath = path.join(dataDir, "cli-session-state.json");

    const senderJoin = runCli(
      [
        "join",
        "--slug",
        "resume-room",
        "--name",
        "sender",
        "--runtime",
        "codex-cli",
      ],
      env,
    );
    expect(senderJoin.status).toBe(0);
    const originalSender = JSON.parse(senderJoin.stdout) as { sessionId: string };

    const recipientJoin = runCli(
      [
        "join",
        "--slug",
        "resume-room",
        "--name",
        "recipient",
        "--runtime",
        "cursor-app",
      ],
      env,
    );
    expect(recipientJoin.status).toBe(0);

    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      currentKey: string;
      sessions: Record<string, { displayName: string; reconnectSecret: string }>;
    };
    const senderKey = Object.entries(state.sessions).find(
      ([, session]) => session.displayName === "sender",
    )?.[0];
    expect(senderKey).toBeDefined();
    state.currentKey = senderKey!;
    state.sessions[senderKey!]!.reconnectSecret = "not-the-secret";
    writeFileSync(statePath, JSON.stringify(state), "utf8");

    const send = runCli(["send", "--slug", "resume-room", "after resume failure"], env);
    expect(send.status).toBe(0);

    const reselectRecipient = runCli(
      [
        "join",
        "--slug",
        "resume-room",
        "--name",
        "recipient",
        "--runtime",
        "cursor-app",
      ],
      env,
    );
    expect(reselectRecipient.status).toBe(0);
    const pulled = runCli(["pull", "--slug", "resume-room", "--clear"], env);
    expect(pulled.status).toBe(0);
    const payload = JSON.parse(pulled.stdout) as {
      count: number;
      items: Array<{ envelope: { sessionId: string; payload: { text?: string } } }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.items[0]?.envelope.payload.text).toBe("after resume failure");
    expect(payload.items[0]?.envelope.sessionId).not.toBe(
      originalSender.sessionId,
    );
  });
});
