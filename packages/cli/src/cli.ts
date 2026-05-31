import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import openUrl from "open";
import {
  ensureRelayRunning,
  getRelayStatus,
  resolveAgentTalkieDataDir,
  stopRelay,
} from "@agent-talkie/supervisor";
import {
  runSpaceStatus,
  runTranscriptCommand,
  runWhoCommand,
} from "./oversight/static-commands.js";
import { runWatch } from "./oversight/watch.js";
import {
  runCreateSpaceCommand,
  runJoinFromPromptCommand,
  runJoinCommand,
  runListActiveSpacesCommand,
  runPullCommand,
  runSendCommand,
} from "./session-commands.js";
import {
  runCodexStartCommand,
  runCodexStatusCommand,
  runCodexStopCommand,
} from "./codex-sidecar.js";

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

function isConfiguredCursorMcpCommand(projectRoot: string, command: unknown): boolean {
  if (typeof command !== "string" || command.trim() === "") {
    return false;
  }
  if (command === "talkie-cursor-mcp") {
    return true;
  }
  const resolved = isAbsolute(command)
    ? command
    : resolve(projectRoot, command);
  const expected = join(projectRoot, ".agent-talkie", "bin", "talkie-cursor-mcp");
  return resolved === expected && isExecutablePath(resolved);
}

function isConfiguredClaudeMcpCommand(projectRoot: string, command: unknown): boolean {
  if (typeof command !== "string" || command.trim() === "") {
    return false;
  }
  if (command === "talkie-claude-mcp") {
    return true;
  }
  const resolved = isAbsolute(command)
    ? command
    : resolve(projectRoot, command);
  const expected = join(projectRoot, ".agent-talkie", "bin", "talkie-claude-mcp");
  return resolved === expected && isExecutablePath(resolved);
}

function checkCodexLiveSidecar(projectRoot: string, skipped: boolean): DoctorCheck {
  const wrapperPath = join(
    projectRoot,
    ".agent-talkie",
    "bin",
    "talkie-codex-adapter",
  );
  if (skipped) {
    return {
      ok: true,
      path: wrapperPath,
      mode: "live",
      status: "skipped",
    };
  }
  const executable = isExecutablePath(wrapperPath);
  return {
    ok: executable,
    path: wrapperPath,
    mode: "live",
    kind: "codex-adapter-wrapper",
    status: executable ? "configured" : "missing",
  };
}

function hasSkillFrontmatter(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const content = readFileSync(path, "utf8");
  return /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.test(content);
}

function checkCodexPullFlow(opts: {
  path: string;
  runtime: "codex-cli" | "codex-app";
  skipped: boolean;
  skillExists: boolean;
  hasFrontmatter: boolean;
}): DoctorCheck {
  if (opts.skipped) {
    return {
      ok: true,
      path: opts.path,
      runtime: opts.runtime,
      mode: "pull",
      status: "skipped",
    };
  }
  if (!opts.skillExists) {
    return {
      ok: false,
      path: opts.path,
      runtime: opts.runtime,
      mode: "pull",
      status: "missing",
    };
  }
  if (!opts.hasFrontmatter) {
    return {
      ok: false,
      path: opts.path,
      runtime: opts.runtime,
      mode: "pull",
      status: "invalid_frontmatter",
    };
  }
  const content = readFileSync(opts.path, "utf8");
  const hasRuntimeInstruction = content.includes(opts.runtime);
  const hasPullInstruction =
    /\bpull-based\b/i.test(content) || /\btalkie pull\b/i.test(content);
  return {
    ok: hasRuntimeInstruction && hasPullInstruction,
    path: opts.path,
    runtime: opts.runtime,
    mode: "pull",
    status:
      hasRuntimeInstruction && hasPullInstruction
        ? "configured"
        : "missing_pull_flow_instructions",
  };
}

function handleError(err: unknown): void {
  console.error(err);
  process.exitCode = 1;
}

type DoctorCheck = { ok: boolean; [key: string]: unknown };

type DoctorRuntimeSelection = {
  codex: boolean;
  cursor: boolean;
  claude: boolean;
};

function isExecutablePath(path: string): boolean {
  try {
    return existsSync(path) && (statSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveDoctorRuntimeSelection(
  projectRoot: string,
  explicitSelection?: Partial<DoctorRuntimeSelection>,
): DoctorRuntimeSelection {
  if (
    explicitSelection?.codex === true ||
    explicitSelection?.cursor === true ||
    explicitSelection?.claude === true
  ) {
    return {
      codex: explicitSelection.codex === true,
      cursor: explicitSelection.cursor === true,
      claude: explicitSelection.claude === true,
    };
  }

  const manifestPath = join(projectRoot, ".agent-talkie", "install-manifest.json");
  if (!existsSync(manifestPath)) {
    return { codex: true, cursor: true, claude: true };
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      files?: Array<{ kind?: unknown }>;
    };
    const kinds = new Set(
      (parsed.files ?? [])
        .map((file) => file.kind)
        .filter((kind): kind is string => typeof kind === "string"),
    );
    return {
      codex: kinds.has("codex-skill") || kinds.has("codex-adapter-bin"),
      cursor: kinds.has("cursor-skill") || kinds.has("cursor-mcp"),
      claude: kinds.has("claude-skill") || kinds.has("claude-mcp"),
    };
  } catch {
    return { codex: true, cursor: true, claude: true };
  }
}

async function runDoctor(opts: {
  projectRoot?: string;
  startRelay?: boolean;
  codex?: boolean;
  cursor?: boolean;
  claude?: boolean;
}): Promise<void> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const checks: Record<string, DoctorCheck> = {};
  const runtimeSelection = resolveDoctorRuntimeSelection(projectRoot, {
    codex: opts.codex,
    cursor: opts.cursor,
    claude: opts.claude,
  });

  let relayPort: number | undefined;
  let relayGeneration: string | undefined;
  if (opts.startRelay === false) {
    const status = await getRelayStatus({});
    if (status.running) {
      relayPort = status.port;
      relayGeneration = status.generation;
      checks.relay = {
        ok: true,
        status: "running",
        url: `http://127.0.0.1:${status.port}/__agent-talkie/v1/health?generation=${encodeURIComponent(status.generation)}`,
      };
    } else {
      checks.relay = { ok: false, status: "not_running" };
    }
  } else {
    try {
      const relay = await ensureRelayRunning({});
      relayPort = relay.port;
      relayGeneration = relay.generation;
      checks.relay = {
        ok: true,
        status: "running",
        url: `http://127.0.0.1:${relay.port}/__agent-talkie/v1/health?generation=${encodeURIComponent(relay.generation)}`,
      };
    } catch (error) {
      checks.relay = {
        ok: false,
        status: "start_failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (relayPort !== undefined) {
    const dashboardUrl = `http://127.0.0.1:${relayPort}/dashboard`;
    checks.dashboard = {
      ok: false,
      status: "unverified",
      url: dashboardUrl,
    };
    if (relayGeneration !== undefined && checks.relay.ok) {
      try {
        const healthUrl = `http://127.0.0.1:${relayPort}/__agent-talkie/v1/health?generation=${encodeURIComponent(relayGeneration)}`;
        const res = await fetch(healthUrl);
        checks.relay.ok = res.ok;
        checks.relay.status = res.ok ? "running" : `health_${res.status}`;
      } catch (error) {
        checks.relay.ok = false;
        checks.relay.status = "health_failed";
        checks.relay.error = error instanceof Error ? error.message : String(error);
      }
    }
    try {
      const res = await fetch(dashboardUrl);
      checks.dashboard.ok = res.ok;
      checks.dashboard.status = res.ok ? "available" : `http_${res.status}`;
    } catch (error) {
      checks.dashboard.ok = false;
      checks.dashboard.status = "http_failed";
      checks.dashboard.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    checks.dashboard = { ok: false, status: "relay_unavailable" };
  }

  const cliPath = fileURLToPath(import.meta.url);
  checks.cli = { ok: existsSync(cliPath), path: cliPath };

  const dataDir = resolveAgentTalkieDataDir();
  checks.dataDir = { ok: existsSync(dataDir), path: dataDir };

  const codexSkillPath = join(projectRoot, ".codex", "skills", "talkie-space", "SKILL.md");
  if (!runtimeSelection.codex) {
    checks.codexLiveSidecar = checkCodexLiveSidecar(projectRoot, true);
    checks.codexSkillTemplate = { ok: true, path: codexSkillPath, status: "skipped" };
    checks.codexCliPullFlow = checkCodexPullFlow({
      path: codexSkillPath,
      runtime: "codex-cli",
      skipped: true,
      skillExists: false,
      hasFrontmatter: false,
    });
    checks.codexAppPullFlow = checkCodexPullFlow({
      path: codexSkillPath,
      runtime: "codex-app",
      skipped: true,
      skillExists: false,
      hasFrontmatter: false,
    });
  } else {
    checks.codexLiveSidecar = checkCodexLiveSidecar(projectRoot, false);
    const codexSkillExists = existsSync(codexSkillPath);
    const codexSkillHasFrontmatter = hasSkillFrontmatter(codexSkillPath);
    checks.codexSkillTemplate = {
      ok: codexSkillExists && codexSkillHasFrontmatter,
      path: codexSkillPath,
      status: codexSkillExists ? "configured" : "missing",
    };
    if (codexSkillExists && !checks.codexSkillTemplate.ok) {
      checks.codexSkillTemplate.status = "invalid_frontmatter";
    }
    checks.codexCliPullFlow = checkCodexPullFlow({
      path: codexSkillPath,
      runtime: "codex-cli",
      skipped: false,
      skillExists: codexSkillExists,
      hasFrontmatter: codexSkillHasFrontmatter,
    });
    checks.codexAppPullFlow = checkCodexPullFlow({
      path: codexSkillPath,
      runtime: "codex-app",
      skipped: false,
      skillExists: codexSkillExists,
      hasFrontmatter: codexSkillHasFrontmatter,
    });
  }

  const cursorSkillPath = join(projectRoot, ".cursor", "skills", "talkie-space", "SKILL.md");
  if (!runtimeSelection.cursor) {
    checks.cursorSkillTemplate = { ok: true, path: cursorSkillPath, status: "skipped" };
  } else {
    const cursorSkillExists = existsSync(cursorSkillPath);
    checks.cursorSkillTemplate = {
      ok: cursorSkillExists && hasSkillFrontmatter(cursorSkillPath),
      path: cursorSkillPath,
      status: cursorSkillExists ? "configured" : "missing",
    };
    if (cursorSkillExists && !checks.cursorSkillTemplate.ok) {
      checks.cursorSkillTemplate.status = "invalid_frontmatter";
    }
  }

  const claudeSkillPath = join(projectRoot, ".claude", "skills", "talkie-space", "SKILL.md");
  if (!runtimeSelection.claude) {
    checks.claudeSkillTemplate = { ok: true, path: claudeSkillPath, status: "skipped" };
  } else {
    const claudeSkillExists = existsSync(claudeSkillPath);
    checks.claudeSkillTemplate = {
      ok: claudeSkillExists && hasSkillFrontmatter(claudeSkillPath),
      path: claudeSkillPath,
      status: claudeSkillExists ? "configured" : "missing",
    };
    if (claudeSkillExists && !checks.claudeSkillTemplate.ok) {
      checks.claudeSkillTemplate.status = "invalid_frontmatter";
    }
  }

  const cursorMcpPath = join(projectRoot, ".cursor", "mcp.json");
  if (!runtimeSelection.cursor) {
    checks.cursorMcpConfig = {
      ok: true,
      path: cursorMcpPath,
      status: "skipped",
    };
  } else if (!existsSync(cursorMcpPath)) {
    checks.cursorMcpConfig = {
      ok: false,
      path: cursorMcpPath,
      status: "missing",
    };
  } else {
    try {
      const parsed = JSON.parse(readFileSync(cursorMcpPath, "utf8")) as {
        mcpServers?: Record<string, { command?: unknown }>;
      };
      const server = parsed.mcpServers?.["agent-talkie"];
      const configured = isConfiguredCursorMcpCommand(projectRoot, server?.command);
      checks.cursorMcpConfig = {
        ok: configured,
        path: cursorMcpPath,
        status: configured ? "configured" : "invalid",
      };
    } catch (error) {
      checks.cursorMcpConfig = {
        ok: false,
        path: cursorMcpPath,
        status: "invalid_json",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const claudeMcpPath = join(projectRoot, ".mcp.json");
  if (!runtimeSelection.claude) {
    checks.claudeMcpConfig = {
      ok: true,
      path: claudeMcpPath,
      status: "skipped",
    };
  } else if (!existsSync(claudeMcpPath)) {
    checks.claudeMcpConfig = {
      ok: false,
      path: claudeMcpPath,
      status: "missing",
    };
  } else {
    try {
      const parsed = JSON.parse(readFileSync(claudeMcpPath, "utf8")) as {
        mcpServers?: Record<string, { command?: unknown }>;
      };
      const server = parsed.mcpServers?.["agent-talkie"];
      const configured = isConfiguredClaudeMcpCommand(projectRoot, server?.command);
      checks.claudeMcpConfig = {
        ok: configured,
        path: claudeMcpPath,
        status: configured ? "configured" : "invalid",
      };
    } catch (error) {
      checks.claudeMcpConfig = {
        ok: false,
        path: claudeMcpPath,
        status: "invalid_json",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const ok = Object.values(checks).every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks }));
  if (!ok) {
    process.exitCode = 1;
  }
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

const codexCmd = program.command("codex");
codexCmd.description("Manage a Codex CLI live sidecar");

codexCmd
  .command("start")
  .description("Start or reuse a Codex CLI live sidecar for a Talkie Space")
  .requiredOption("--slug <slug>", "space slug")
  .requiredOption("--name <name>", "Codex session display name")
  .requiredOption("--workspace-label <label>", "workspace label shown in roster/session metadata")
  .option("--project-root <path>", "project/config root to launch from", process.cwd())
  .action(async (opts: {
    slug: string;
    name: string;
    workspaceLabel: string;
    projectRoot?: string;
  }) => {
    try {
      await runCodexStartCommand({
        slug: opts.slug,
        name: opts.name,
        workspaceLabel: opts.workspaceLabel,
        projectRoot: opts.projectRoot,
      });
    } catch (e) {
      handleError(e);
    }
  });

codexCmd
  .command("status")
  .description("Print Codex CLI live sidecar status")
  .action(async () => {
    try {
      await runCodexStatusCommand();
    } catch (e) {
      handleError(e);
    }
  });

codexCmd
  .command("stop")
  .description("Stop Codex CLI live sidecars")
  .option("--slug <slug>", "space slug")
  .option("--name <name>", "Codex session display name")
  .option("--workspace-label <label>", "workspace label shown in roster/session metadata")
  .action(async (opts: {
    slug?: string;
    name?: string;
    workspaceLabel?: string;
  }) => {
    try {
      await runCodexStopCommand({
        slug: opts.slug,
        name: opts.name,
        workspaceLabel: opts.workspaceLabel,
      });
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

program
  .command("doctor")
  .description("Check local Agent Talkie relay, dashboard, CLI, skills, and runtime MCP setup")
  .option("--workspace", "Alias for checking the current project/config root")
  .option("--project-root <path>", "project/config root to inspect", process.cwd())
  .option("--codex", "Check Codex CLI/Codex App skill support")
  .option("--cursor", "Check Cursor skill and MCP support")
  .option("--claude", "Check Claude Code skill and MCP support")
  .option("--no-start-relay", "Do not start the relay while checking setup")
  .action(async (opts: {
    projectRoot?: string;
    startRelay?: boolean;
    codex?: boolean;
    cursor?: boolean;
    claude?: boolean;
  }) => {
    try {
      await runDoctor(opts);
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
  .command("create-space")
  .description(
    "Create a local Talkie Space without naming it, join as this runtime, and print a dashboard URL plus join prompt",
  )
  .requiredOption("--name <name>", "local session display name")
  .requiredOption("--runtime <runtime>", "runtime label")
  .option("--workspace-label <label>", "workspace label shown in roster/session metadata")
  .option("--no-orchestrator", "Do not make the creating runtime orchestrator")
  .option("--no-open", "Print URL only; do not open a browser")
  .action(async (opts: {
    name: string;
    runtime: string;
    workspaceLabel?: string;
    orchestrator?: boolean;
    open?: boolean;
  }) => {
    try {
      const { port } = await ensureRelayRunning({});
      const payload = await runCreateSpaceCommand({
        name: opts.name,
        runtime: opts.runtime,
        workspaceLabel: opts.workspaceLabel,
        creatorOrchestrator: opts.orchestrator !== false,
        dashboardBaseUrl: `http://127.0.0.1:${port}/dashboard`,
      });
      console.log(JSON.stringify(payload));
      if (opts.open !== false && payload.dashboardUrl !== undefined) {
        await openUrl(payload.dashboardUrl);
      }
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("list-active-spaces")
  .description("List active and idle local Talkie Spaces as product-level JSON")
  .action(async () => {
    try {
      await runListActiveSpacesCommand();
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("join-from-prompt")
  .description("Join a local Talkie Space from a pasted dashboard join prompt")
  .requiredOption("--prompt <prompt>", "dashboard join prompt text")
  .requiredOption("--name <name>", "local session display name")
  .requiredOption("--runtime <runtime>", "runtime label")
  .option("--workspace-label <label>", "workspace label shown in roster/session metadata")
  .action(async (opts: {
    prompt: string;
    name: string;
    runtime: string;
    workspaceLabel?: string;
  }) => {
    try {
      await runJoinFromPromptCommand({
        prompt: opts.prompt,
        name: opts.name,
        runtime: opts.runtime,
        workspaceLabel: opts.workspaceLabel,
      });
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
  .option("--workspace-label <label>", "workspace label shown in roster/session metadata")
  .action(async (opts: {
    slug: string;
    name: string;
    runtime: string;
    workspaceLabel?: string;
  }) => {
    try {
      await runJoinCommand({
        slug: opts.slug,
        name: opts.name,
        runtime: opts.runtime,
        workspaceLabel: opts.workspaceLabel,
      });
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
  .option("--workspace-label <label>", "select a joined local session by workspace label")
  .argument("<message>", "message text")
  .action(async (message: string, opts: {
    slug: string;
    to?: string;
    name?: string;
    runtime?: string;
    workspaceLabel?: string;
  }) => {
    try {
      await runSendCommand(message, {
        slug: opts.slug,
        to: opts.to,
        name: opts.name,
        runtime: opts.runtime,
        workspaceLabel: opts.workspaceLabel,
      });
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
  .option("--workspace-label <label>", "select a joined local session by workspace label")
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
    workspaceLabel?: string;
    clear?: boolean;
    limit: number;
  }) => {
    try {
      await runPullCommand({
        slug: opts.slug,
        name: opts.name,
        runtime: opts.runtime,
        workspaceLabel: opts.workspaceLabel,
        clear: opts.clear,
        limit: opts.limit,
      });
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
