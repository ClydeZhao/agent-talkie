#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
const packageSpecifier = `${packageJson.name}@${packageJson.version}`;

async function runProxyCommand(argv) {
  const [command, ...rest] = argv;
  if (command === "talkie") {
    process.argv = [process.argv[0], "talkie", ...rest];
    await import("@agent-talkie/cli");
    return true;
  }
  if (command === "talkie-cursor-mcp") {
    process.env.TALKIE_MCP_DISPLAY_NAME ??= "cursor";
    process.env.TALKIE_MCP_RUNTIME ??= "cursor-app";
    process.env.TALKIE_MCP_STATE_NAMESPACE ??= "cursor-app";
    process.env.TALKIE_MCP_IS_HUMAN ??= "0";
    const { runMcpServer } = await import("@agent-talkie/adapter-cursor-mcp");
    await runMcpServer();
    return true;
  }
  if (command === "talkie-claude-mcp") {
    process.env.TALKIE_MCP_DISPLAY_NAME ??= "claude-code";
    process.env.TALKIE_MCP_RUNTIME ??= "claude-code";
    process.env.TALKIE_MCP_STATE_NAMESPACE ??= "claude-code";
    process.env.TALKIE_MCP_IS_HUMAN ??= "0";
    const { runMcpServer } = await import("@agent-talkie/adapter-cursor-mcp");
    await runMcpServer();
    return true;
  }
  return false;
}

function parseArgs(argv) {
  const out = {
    projectRoot: process.cwd(),
    codex: false,
    cursor: false,
    claude: false,
    yes: false,
    dryRun: false,
    uatGuide: false,
    local: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project-root") {
      out.projectRoot = resolve(argv[++i] ?? process.cwd());
    } else if (arg === "--codex") {
      out.codex = true;
    } else if (arg === "--cursor") {
      out.cursor = true;
    } else if (arg === "--claude") {
      out.claude = true;
    } else if (arg === "--yes" || arg === "-y") {
      out.yes = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--uat-guide") {
      out.uatGuide = true;
    } else if (arg === "--global") {
      throw new Error("--global is not supported by the v3 local installer; use --local");
    } else if (arg === "--local") {
      out.local = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`agent-talkie installer

Usage:
  npx ${packageSpecifier} [--project-root <path>] [--codex] [--cursor] [--claude] [--local] [--yes] [--dry-run]
  npx ${packageSpecifier} --uat-guide [--project-root <path>]

By default, the installer asks which local runtimes to configure and writes only
Talkie-owned skill/config entries, durable .agent-talkie/bin wrappers, and
.agent-talkie/install-manifest.json.

--project-root is the project/config root to install into, not the collaboration
space and not a requirement that every joined runtime uses the same directory.

--uat-guide prints the manual desktop UAT checklist. It does not install files
or mark UAT as passed.
`);
}

function printUatGuide(projectRoot) {
  console.log(`Agent Talkie local Codex + Claude UAT 手动指南

推荐安装位置：
  ${projectRoot}

如果你是在 agent-talkie 开发仓库里验证尚未发布的本地改动，使用本地 source entrypoint：

  cd ${shellQuote(projectRoot)}
  node packages/distribution/bin/agent-talkie.js --yes --local --codex --claude --project-root "$PWD"
  ./.agent-talkie/bin/talkie doctor --project-root "$PWD" --codex --claude

只有在确认 npm 包已经发布当前实现后，才使用发布包入口：

  cd ${shellQuote(projectRoot)}
  npx ${packageSpecifier} --yes --local --codex --claude --project-root "$PWD"
  ./.agent-talkie/bin/talkie doctor --project-root "$PWD" --codex --claude

如果 npm 包仍是 placeholder 或旧版本，不要用 npx 做本地 UAT。

doctor 只证明本地入口、runtime integration config、relay/dashboard 健康；它不能替代桌面 UAT。

必须人工观察通过的步骤：
  1. 在 Codex CLI、Codex App 或 Claude Code 中任选一个支持的 runtime 创建本地 Talkie Space。
  2. 确认 dashboard 打开到该 Space，并显示空间标签、讨论输入框、成员列表、relay 状态和 join prompt。
  3. 让另一个 runtime 通过自己的 Talkie tooling 加入同一个 Space，并 hello/ack。
  4. 轮流把 Codex CLI、Claude Code 指定为 orchestrator，确认 dashboard 默认讨论消息都能被当前 orchestrator 收到并回复。
  5. 在 dashboard 点 participant 发 private intervention，确认对方响应或状态变化可见。
  6. 确认至少一次 session-to-session 讨论不需要你手动搬运消息。
  7. 刷新 dashboard，确认没有多出重复的 active Human。
  8. Archive 当前 Space，确认 active list 不再显示它、输入框禁用、transcript 仍可查看。
  9. 新建一个 Space，测试 dashboard 的 relay Stop/Restart，确认状态和连接数恢复。

通过标准：
  Codex CLI 和 Claude Code 必须同时被观察到加入同一个本地 Talkie Space；orchestrator/worker 角色不得绑定 runtime 品牌；以上步骤全部成功。Codex App 使用同一套 pull-based Codex skill/CLI flow，可作为额外覆盖项验证，但不能替代 Codex CLI + Claude Code gate。Cursor App 是后续扩展，不属于当前 UAT gate。

可直接复制给各 runtime 的提示词：

Codex CLI:
  Use the installed Talkie CLI yourself. Join this Talkie Space from the pasted prompt below, then send a hello/ack through Talkie and keep checking with talkie pull --clear for a follow-up message. Do not ask me to run low-level join/send/pull transport commands.
  <paste dashboard join prompt here>

Codex App:
  Use the installed talkie-space skill and the same pull-based command flow as Codex CLI, but identify this session with --runtime codex-app. Join this Talkie Space from the pasted prompt below, then send a hello/ack through Talkie and keep checking with talkie pull --clear before answering dashboard follow-up messages. Do not ask me to run low-level join/send/pull transport commands.
  <paste dashboard join prompt here>

Claude Code:
  Use the talkie-space skill and configured agent-talkie MCP tools. Call join_from_prompt with the pasted prompt below, then use pull_inbox and send_message to hello/ack. Keep using pull_inbox with clear=true for dashboard follow-up messages. If MCP tools are unavailable, report that as a setup blocker instead of asking me to run low-level transport commands.
  <paste dashboard join prompt here>

跑完后回传给 Codex 的证据模板：

  projectRoot:
  spaceLabel:
  joinPromptCopied: yes/no
  doctorOk: yes/no
  codexCliJoinedAndAcked: yes/no + 现象/截图说明
  codexAppJoinedAndAcked: yes/no/not-tested + 现象/截图说明
  claudeCodeJoinedAndAcked: yes/no + 现象/截图说明
  orchestratorRotationWorked: yes/no + 现象/截图说明
  sessionToSessionWorked: yes/no + 现象/截图说明
  dashboardDiscussionWorked: yes/no + 现象/截图说明
  privateInterventionWorked: yes/no + 现象/截图说明
  dashboardReloadNoDuplicateHuman: yes/no
  archiveAndTranscriptWorked: yes/no
  relayStopRestartRecovered: yes/no
  failuresOrConfusingSteps:
`);
}

async function promptIfNeeded(opts) {
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !opts.yes;
  if (!interactive) {
    if (!opts.codex && !opts.cursor && !opts.claude) {
      opts.codex = true;
      opts.cursor = true;
      opts.claude = true;
    }
    if (!opts.local) {
      opts.local = true;
    }
    return opts;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    if (!opts.codex && !opts.cursor && !opts.claude) {
      const runtimes = (
        await rl.question("Configure runtimes? [codex,cursor,claude] ")
      ).trim().toLowerCase();
      opts.codex = runtimes === "" || runtimes.includes("codex");
      opts.cursor = runtimes === "" || runtimes.includes("cursor");
      opts.claude = runtimes === "" || runtimes.includes("claude");
    }
    opts.local = true;
    return opts;
  } finally {
    rl.close();
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function backupIfExists(path, dryRun) {
  if (!existsSync(path)) {
    return null;
  }
  const backup = `${path}.agent-talkie.bak`;
  if (!dryRun) {
    copyFileSync(path, backup);
  }
  return backup;
}

function writeManagedFile(path, content, dryRun, mode) {
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, mode === undefined ? undefined : { mode });
    if (mode !== undefined) {
      chmodSync(path, mode);
    }
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function wrapperContent(command) {
  const agentTalkieBin = join(pkgRoot, "bin", "agent-talkie.js");
  return `#!/bin/sh
AGENT_TALKIE_BIN=${shellQuote(agentTalkieBin)}
if [ -f "$AGENT_TALKIE_BIN" ]; then
  exec node "$AGENT_TALKIE_BIN" ${command} "$@"
fi
exec npx -y ${packageSpecifier} ${command} "$@"
`;
}

function installWrapper(path, command, dryRun) {
  const backup = backupIfExists(path, dryRun);
  writeManagedFile(path, wrapperContent(command), dryRun, 0o755);
  return backup;
}

function mergeCursorMcp(path, commandPath, dryRun) {
  let existing = {};
  let backup = null;
  if (existsSync(path)) {
    backup = backupIfExists(path, dryRun);
    existing = JSON.parse(readFileSync(path, "utf8"));
  }
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      "agent-talkie": {
        type: "stdio",
        command: commandPath,
      },
    },
  };
  writeManagedFile(path, `${JSON.stringify(next, null, 2)}\n`, dryRun);
  return backup;
}

function mergeClaudeMcp(path, commandPath, dryRun) {
  let existing = {};
  let backup = null;
  if (existsSync(path)) {
    backup = backupIfExists(path, dryRun);
    existing = JSON.parse(readFileSync(path, "utf8"));
  }
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      "agent-talkie": {
        type: "stdio",
        command: commandPath,
        args: [],
      },
    },
  };
  writeManagedFile(path, `${JSON.stringify(next, null, 2)}\n`, dryRun);
  return backup;
}

function readTemplate(runtime) {
  return readFileSync(
    join(pkgRoot, "skills", runtime, "talkie-space", "SKILL.md"),
    "utf8",
  );
}

function install(opts) {
  const manifest = {
    version: "0.1.0-alpha.0",
    installedAt: new Date().toISOString(),
    scope: "local",
    projectRoot: opts.projectRoot,
    files: [],
  };

  const binDir = join(opts.projectRoot, ".agent-talkie", "bin");
  const talkieBin = join(binDir, "talkie");
  const talkieBinBackup = installWrapper(talkieBin, "talkie", opts.dryRun);
  manifest.files.push({ kind: "talkie-bin", path: talkieBin, backup: talkieBinBackup });

  if (opts.codex) {
    const target = join(opts.projectRoot, ".codex", "skills", "talkie-space", "SKILL.md");
    const backup = backupIfExists(target, opts.dryRun);
    writeManagedFile(target, readTemplate("codex"), opts.dryRun);
    manifest.files.push({ kind: "codex-skill", path: target, backup });
  }

  if (opts.cursor) {
    const cursorMcpBin = join(binDir, "talkie-cursor-mcp");
    const cursorMcpBinBackup = installWrapper(
      cursorMcpBin,
      "talkie-cursor-mcp",
      opts.dryRun,
    );
    manifest.files.push({
      kind: "cursor-mcp-bin",
      path: cursorMcpBin,
      backup: cursorMcpBinBackup,
    });

    const skillTarget = join(opts.projectRoot, ".cursor", "skills", "talkie-space", "SKILL.md");
    const skillBackup = backupIfExists(skillTarget, opts.dryRun);
    writeManagedFile(skillTarget, readTemplate("cursor"), opts.dryRun);
    manifest.files.push({ kind: "cursor-skill", path: skillTarget, backup: skillBackup });

    const mcpTarget = join(opts.projectRoot, ".cursor", "mcp.json");
    const mcpBackup = mergeCursorMcp(mcpTarget, cursorMcpBin, opts.dryRun);
    manifest.files.push({ kind: "cursor-mcp", path: mcpTarget, backup: mcpBackup });
  }

  if (opts.claude) {
    const claudeMcpBin = join(binDir, "talkie-claude-mcp");
    const claudeMcpBinBackup = installWrapper(
      claudeMcpBin,
      "talkie-claude-mcp",
      opts.dryRun,
    );
    manifest.files.push({
      kind: "claude-mcp-bin",
      path: claudeMcpBin,
      backup: claudeMcpBinBackup,
    });

    const skillTarget = join(opts.projectRoot, ".claude", "skills", "talkie-space", "SKILL.md");
    const skillBackup = backupIfExists(skillTarget, opts.dryRun);
    writeManagedFile(skillTarget, readTemplate("claude"), opts.dryRun);
    manifest.files.push({ kind: "claude-skill", path: skillTarget, backup: skillBackup });

    const mcpTarget = join(opts.projectRoot, ".mcp.json");
    const mcpBackup = mergeClaudeMcp(mcpTarget, claudeMcpBin, opts.dryRun);
    manifest.files.push({ kind: "claude-mcp", path: mcpTarget, backup: mcpBackup });
  }

  const manifestPath = join(opts.projectRoot, ".agent-talkie", "install-manifest.json");
  if (!opts.dryRun) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    for (const file of manifest.files) {
      if (existsSync(file.path)) {
        file.sha256 = sha256(file.path);
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return { ok: true, dryRun: opts.dryRun, manifestPath, manifest };
}

try {
  const argv = process.argv.slice(2);
  if (!(await runProxyCommand(argv))) {
    const parsed = parseArgs(argv);
    if (parsed.uatGuide) {
      printUatGuide(parsed.projectRoot);
    } else {
      const opts = await promptIfNeeded(parsed);
      const result = install(opts);
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
