import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ensureRelayRunning,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";

const CODEX_SIDECAR_STATE_FILE = "codex-sidecars.json";
const CODEX_RUNTIME = "codex-cli";

type CodexSidecarRecord = {
  key: string;
  slug: string;
  displayName: string;
  runtime: typeof CODEX_RUNTIME;
  workspaceLabel: string;
  pid: number;
  logPath: string;
  command: string;
  args: string[];
  startedAtMs: number;
};

type CodexSidecarState = {
  sidecars: Record<string, CodexSidecarRecord>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sidecarStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CODEX_SIDECAR_STATE_FILE);
}

function readSidecarState(): CodexSidecarState {
  try {
    const parsed = JSON.parse(readFileSync(sidecarStatePath(), "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { sidecars?: unknown }).sidecars === "object" &&
      (parsed as { sidecars?: unknown }).sidecars !== null
    ) {
      return parsed as CodexSidecarState;
    }
  } catch {
    /* ignore missing or invalid state */
  }
  return { sidecars: {} };
}

function writeSidecarState(state: CodexSidecarState): void {
  const dataDir = resolveAgentTalkieDataDir();
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(sidecarStatePath(), `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(sidecarStatePath(), 0o600);
}

function sidecarKey(args: {
  slug: string;
  displayName: string;
  workspaceLabel: string;
}): string {
  return JSON.stringify({
    slug: args.slug,
    displayName: args.displayName,
    runtime: CODEX_RUNTIME,
    workspaceLabel: args.workspaceLabel,
  });
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseAdapterArgs(): string[] {
  const raw = process.env.TALKIE_CODEX_ADAPTER_ARGS_JSON;
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("TALKIE_CODEX_ADAPTER_ARGS_JSON must be a JSON array of strings");
  }
  return [...parsed];
}

function resolveAdapterCommand(projectRoot: string): string {
  const override = process.env.TALKIE_CODEX_ADAPTER_COMMAND?.trim();
  if (override) {
    return override;
  }
  const installedWrapper = join(
    projectRoot,
    ".agent-talkie",
    "bin",
    "talkie-codex-adapter",
  );
  if (existsSync(installedWrapper)) {
    return installedWrapper;
  }
  return "talkie-codex-adapter";
}

function publicRecord(record: CodexSidecarRecord): CodexSidecarRecord & {
  running: boolean;
} {
  return {
    ...record,
    running: isPidRunning(record.pid),
  };
}

function pruneExitedSidecars(state: CodexSidecarState): number {
  let pruned = 0;
  for (const [key, record] of Object.entries(state.sidecars)) {
    if (!isPidRunning(record.pid)) {
      delete state.sidecars[key];
      pruned += 1;
    }
  }
  return pruned;
}

export async function runCodexStartCommand(opts: {
  slug: string;
  name: string;
  workspaceLabel: string;
  projectRoot?: string;
}): Promise<void> {
  await ensureRelayRunning({});
  const projectRoot = opts.projectRoot ?? process.cwd();
  const key = sidecarKey({
    slug: opts.slug,
    displayName: opts.name,
    workspaceLabel: opts.workspaceLabel,
  });
  const state = readSidecarState();
  const existing = state.sidecars[key];
  if (existing && isPidRunning(existing.pid)) {
    console.log(
      JSON.stringify({
        ok: true,
        status: "already-running",
        ...publicRecord(existing),
      }),
    );
    return;
  }
  if (existing) {
    delete state.sidecars[key];
  }

  const dataDir = resolveAgentTalkieDataDir();
  const logDir = join(dataDir, "codex-sidecars");
  mkdirSync(logDir, { recursive: true });
  const startedAtMs = Date.now();
  const logPath = join(
    logDir,
    `${opts.slug}-${startedAtMs.toString(36)}.log`.replace(/[^\w.-]/g, "_"),
  );
  const logFd = openSync(logPath, "a", 0o600);
  const command = resolveAdapterCommand(projectRoot);
  const args = parseAdapterArgs();
  const child = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    env: {
      ...process.env,
      TALKIE_CODEX_JOIN_SLUG: opts.slug,
      TALKIE_CODEX_DISPLAY_NAME: opts.name,
      TALKIE_CODEX_RUNTIME: CODEX_RUNTIME,
      TALKIE_CODEX_WORKSPACE_LABEL: opts.workspaceLabel,
    },
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);

  await sleep(100);
  if (child.pid === undefined || !isPidRunning(child.pid)) {
    throw new Error(`Codex live sidecar failed to stay running. See ${logPath}`);
  }

  const record: CodexSidecarRecord = {
    key,
    slug: opts.slug,
    displayName: opts.name,
    runtime: CODEX_RUNTIME,
    workspaceLabel: opts.workspaceLabel,
    pid: child.pid,
    logPath,
    command,
    args,
    startedAtMs,
  };
  state.sidecars[key] = record;
  writeSidecarState(state);
  console.log(
    JSON.stringify({
      ok: true,
      status: "started",
      ...publicRecord(record),
    }),
  );
}

export async function runCodexStatusCommand(): Promise<void> {
  const state = readSidecarState();
  const stalePruned = pruneExitedSidecars(state);
  if (stalePruned > 0) {
    writeSidecarState(state);
  }
  console.log(
    JSON.stringify({
      ok: true,
      stalePruned,
      sidecars: Object.values(state.sidecars).map(publicRecord),
    }),
  );
}

export async function runCodexStopCommand(opts: {
  slug?: string;
  name?: string;
  workspaceLabel?: string;
}): Promise<void> {
  const state = readSidecarState();
  const records = Object.values(state.sidecars).filter((record) => {
    if (opts.slug !== undefined && record.slug !== opts.slug) {
      return false;
    }
    if (opts.name !== undefined && record.displayName !== opts.name) {
      return false;
    }
    if (
      opts.workspaceLabel !== undefined &&
      record.workspaceLabel !== opts.workspaceLabel
    ) {
      return false;
    }
    return true;
  });
  if (records.length === 0) {
    console.log(JSON.stringify({ ok: true, stopped: false, reason: "not_found" }));
    return;
  }

  for (const record of records) {
    if (isPidRunning(record.pid)) {
      try {
        process.kill(record.pid, "SIGTERM");
      } catch {
        /* process may have exited after liveness check */
      }
    }
    delete state.sidecars[record.key];
  }
  writeSidecarState(state);
  console.log(
    JSON.stringify({
      ok: true,
      stopped: true,
      count: records.length,
      pid: records.length === 1 ? records[0]!.pid : undefined,
    }),
  );
}
