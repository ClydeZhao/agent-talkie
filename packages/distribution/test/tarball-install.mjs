import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = new URL("../../..", import.meta.url);
const tempRoot = mkdtempSync(join(tmpdir(), "agent-talkie-tarball-install-"));
const dataDir = join(tempRoot, "talkie-data");
const projectRootDir = join(tempRoot, "project-root");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `$ ${command} ${args.join(" ")}`,
        `exit ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hasSkillFrontmatter(path) {
  return /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.test(readFileSync(path, "utf8"));
}

function installedTalkiePath() {
  return join(projectRootDir, ".agent-talkie", "bin", "talkie");
}

function installedTalkieEnv() {
  return {
    ...process.env,
    AGENT_TALKIE_DATA_DIR: dataDir,
    AGENT_TALKIE_RELAY_PORT: "0",
  };
}

function runInstalledTalkie(args) {
  return run(installedTalkiePath(), args, {
    cwd: projectRootDir,
    env: installedTalkieEnv(),
  });
}

try {
  const packDir = join(tempRoot, "pack");
  const projectDir = join(tempRoot, "project");

  run("mkdir", ["-p", packDir, projectDir]);
  const pack = run("npm", [
    "pack",
    "-w",
    "agent-talkie",
    "--pack-destination",
    packDir,
  ]);
  const tarball = pack.stdout
    .trim()
    .split("\n")
    .find((line) => line.endsWith(".tgz"));

  if (!tarball) {
    throw new Error(`Could not find tarball name in npm pack output:\n${pack.stdout}`);
  }

  run("npm", ["init", "-y"], { cwd: projectDir });
  run("npm", ["install", join(packDir, tarball)], { cwd: projectDir });
  run("node", ["node_modules/agent-talkie/bin/talkie.js", "--help"], {
    cwd: projectDir,
  });
  const uatGuide = run(
    "node",
    [
      "node_modules/agent-talkie/bin/agent-talkie.js",
      "--uat-guide",
      "--project-root",
      projectDir,
    ],
    { cwd: projectDir },
  );
  if (!uatGuide.stdout.includes("Agent Talkie local Codex + Claude UAT 手动指南")) {
    throw new Error(`UAT guide did not print the manual checklist:\n${uatGuide.stdout}`);
  }
  for (const expectedText of [
    "node packages/distribution/bin/agent-talkie.js --yes --local --codex --claude",
    "doctor 只证明本地入口",
    "Codex CLI:",
    "talkie codex start",
    "Codex App:",
    "Claude Code:",
    "orchestrator/worker 角色不得绑定 runtime 品牌",
    "Cursor App 是后续扩展，不属于当前 UAT gate",
    "Do not ask me to run talkie pull for normal Codex CLI follow-up messages.",
    "跑完后回传给 Codex 的证据模板",
    "claudeCodeJoinedAndAcked: yes/no",
    "orchestratorRotationWorked: yes/no",
    "relayStopRestartRecovered: yes/no",
  ]) {
    if (!uatGuide.stdout.includes(expectedText)) {
      throw new Error(
        `UAT guide is missing expected text ${JSON.stringify(expectedText)}:\n${uatGuide.stdout}`,
      );
    }
  }
  if (existsSync(join(projectDir, ".agent-talkie"))) {
    throw new Error("--uat-guide must not install project files");
  }

  run("mkdir", ["-p", projectRootDir]);
  run(
    "node",
    [
      "node_modules/agent-talkie/bin/agent-talkie.js",
      "--yes",
      "--local",
      "--codex",
      "--cursor",
      "--claude",
      "--project-root",
      projectRootDir,
    ],
    { cwd: projectDir },
  );
  const talkieWrapper = readFileSync(
    join(projectRootDir, ".agent-talkie", "bin", "talkie"),
    "utf8",
  );
  if (talkieWrapper.includes("agent-talkie@latest")) {
    throw new Error("installed talkie wrapper must not invoke agent-talkie@latest");
  }
  run(installedTalkiePath(), ["--help"], {
    cwd: projectRootDir,
  });
  const codexAdapterWrapperPath = join(
    projectRootDir,
    ".agent-talkie",
    "bin",
    "talkie-codex-adapter",
  );
  if (!existsSync(codexAdapterWrapperPath)) {
    throw new Error("Codex adapter wrapper was not installed");
  }
  const codexAdapterWrapper = readFileSync(codexAdapterWrapperPath, "utf8");
  if (!codexAdapterWrapper.includes("talkie-codex-adapter")) {
    throw new Error("Codex adapter wrapper does not launch talkie-codex-adapter");
  }
  const doctor = run(
    installedTalkiePath(),
    ["doctor", "--project-root", projectRootDir],
    {
      cwd: projectRootDir,
      env: installedTalkieEnv(),
    },
  );
  const doctorResult = readJsonFromStdout(doctor.stdout);
  if (doctorResult.ok !== true) {
    throw new Error(`installed talkie doctor failed:\n${doctor.stdout}`);
  }
  for (const key of [
    "relay",
    "dashboard",
    "cli",
    "dataDir",
    "codexSkillTemplate",
    "codexLiveSidecar",
    "codexCliPullFlow",
    "codexAppPullFlow",
    "cursorSkillTemplate",
    "claudeSkillTemplate",
    "cursorMcpConfig",
    "claudeMcpConfig",
  ]) {
    if (doctorResult.checks?.[key]?.ok !== true) {
      throw new Error(`doctor check ${key} did not pass:\n${doctor.stdout}`);
    }
  }
  const cursorMcp = readJson(join(projectRootDir, ".cursor", "mcp.json"));
  if (
    cursorMcp.mcpServers?.["agent-talkie"]?.command !==
    join(projectRootDir, ".agent-talkie", "bin", "talkie-cursor-mcp")
  ) {
    throw new Error("Cursor MCP config does not point at the project-root wrapper");
  }
  const claudeMcp = readJson(join(projectRootDir, ".mcp.json"));
  if (
    claudeMcp.mcpServers?.["agent-talkie"]?.command !==
    join(projectRootDir, ".agent-talkie", "bin", "talkie-claude-mcp")
  ) {
    throw new Error("Claude MCP config does not point at the project-root wrapper");
  }
  for (const skillPath of [
    join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
    join(projectRootDir, ".cursor", "skills", "talkie-space", "SKILL.md"),
    join(projectRootDir, ".claude", "skills", "talkie-space", "SKILL.md"),
  ]) {
    if (!existsSync(skillPath)) {
      throw new Error(`missing installed skill: ${skillPath}`);
    }
    if (!hasSkillFrontmatter(skillPath)) {
      throw new Error(`installed skill is missing YAML frontmatter: ${skillPath}`);
    }
  }
  const installedCodexSkill = readFileSync(
    join(projectRootDir, ".codex", "skills", "talkie-space", "SKILL.md"),
    "utf8",
  );
  for (const expectedText of [
    "talkie codex start",
    "Codex CLI live sidecar",
    "Pull fallback",
    "--runtime codex-app",
    "Codex App",
    "pull-based/best-effort",
  ]) {
    if (!installedCodexSkill.includes(expectedText)) {
      throw new Error(
        `installed Codex skill is missing expected Codex App text ${JSON.stringify(expectedText)}:\n${installedCodexSkill}`,
      );
    }
  }
  const installedClaudeSkill = readFileSync(
    join(projectRootDir, ".claude", "skills", "talkie-space", "SKILL.md"),
    "utf8",
  );
  if (!installedClaudeSkill.includes("labels and actionability")) {
    throw new Error(`installed Claude skill is missing actionability text:\n${installedClaudeSkill}`);
  }
  const stopped = readJsonFromStdout(runInstalledTalkie(["relay", "stop"]).stdout);
  if (stopped.stopped !== true) {
    throw new Error(`installed relay did not stop cleanly: ${JSON.stringify(stopped)}`);
  }
  const relayStatus = readJsonFromStdout(runInstalledTalkie(["relay", "status"]).stdout);
  if (relayStatus.running !== false) {
    throw new Error(`installed relay still reports running: ${JSON.stringify(relayStatus)}`);
  }
} finally {
  if (existsSync(installedTalkiePath())) {
    spawnSync(installedTalkiePath(), ["relay", "stop"], {
      cwd: projectRootDir,
      encoding: "utf8",
      stdio: "ignore",
      env: installedTalkieEnv(),
    });
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

function readJsonFromStdout(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) {
    throw new Error(`Could not find JSON object in stdout:\n${stdout}`);
  }
  return JSON.parse(trimmed.slice(start));
}
