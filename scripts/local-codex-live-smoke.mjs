#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { TalkieSessionClient } from "@agent-talkie/client";
import { runCodexAdapter } from "@agent-talkie/adapter-codex";
import {
  listOversightTranscriptTailBySlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { ensureRelayRunning, stopRelay } from "@agent-talkie/supervisor";

const repoRoot = process.cwd();
const dataDir = mkdtempSync(join(tmpdir(), "agent-talkie-codex-live-smoke-"));
const slug = `codex-live-${Date.now().toString(36)}`;
const firstMessage = "dashboard asks codex live sidecar to answer";
const secondMessage = "second dashboard message while codex is running";

function createFakeCodexSpawn(codexPrompts) {
  return (_cmd, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      child.emit("exit", null, "SIGTERM");
      return true;
    };

    const prompt = String(args.at(-1) ?? "");
    codexPrompts.push(prompt);
    setTimeout(() => {
      child.stdout.write(
        `${JSON.stringify({
          type: "thread.started",
          thread_id: "33333333-3333-4333-8333-333333333333",
        })}\n`,
      );
      child.stdout.write(
        `${JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: `fake codex live reply: ${prompt}`,
          },
        })}\n`,
      );
      child.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.emit("exit", 0, null);
    }, 300);

    return child;
  };
}

async function waitFor(fn, label) {
  for (let i = 0; i < 100; i += 1) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function getSpaceSummary(port) {
  const res = await fetch(
    `http://127.0.0.1:${port}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(slug)}`,
  );
  if (!res.ok) {
    throw new Error(`space-summary failed: ${res.status}`);
  }
  return res.json();
}

function readTranscriptTail() {
  const db = openDatabase(join(dataDir, "relay.sqlite"));
  try {
    migrate(db);
    return listOversightTranscriptTailBySlug(db, { slug, limit: 50 }).map(
      (row) => ({
        ...row,
        envelope: JSON.parse(row.envelopeJson),
      }),
    );
  } finally {
    db.close();
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

const previousEnv = {
  AGENT_TALKIE_DATA_DIR: process.env.AGENT_TALKIE_DATA_DIR,
  AGENT_TALKIE_RELAY_PORT: process.env.AGENT_TALKIE_RELAY_PORT,
  TALKIE_CODEX_JOIN_SLUG: process.env.TALKIE_CODEX_JOIN_SLUG,
  TALKIE_CODEX_DISPLAY_NAME: process.env.TALKIE_CODEX_DISPLAY_NAME,
  TALKIE_CODEX_RUNTIME: process.env.TALKIE_CODEX_RUNTIME,
  TALKIE_CODEX_WORKSPACE_LABEL: process.env.TALKIE_CODEX_WORKSPACE_LABEL,
};

let relay;
let human;
let codexRun;
const abort = new AbortController();

try {
  process.env.AGENT_TALKIE_DATA_DIR = dataDir;
  process.env.AGENT_TALKIE_RELAY_PORT = "0";
  process.env.TALKIE_CODEX_JOIN_SLUG = slug;
  process.env.TALKIE_CODEX_DISPLAY_NAME = "codex-live-smoke";
  process.env.TALKIE_CODEX_RUNTIME = "codex-cli";
  process.env.TALKIE_CODEX_WORKSPACE_LABEL = repoRoot;

  relay = await ensureRelayRunning({});
  const codexPrompts = [];
  let markCodexReady;
  const codexReady = new Promise((resolve) => {
    markCodexReady = resolve;
  });
  codexRun = runCodexAdapter({
    spawn: createFakeCodexSpawn(codexPrompts),
    signal: abort.signal,
    onReady: markCodexReady,
  });
  const codexReadyState = await codexReady;

  human = new TalkieSessionClient({ url: `ws://127.0.0.1:${relay.port}` });
  await human.connect();
  const humanSession = await human.registerSession({
    displayName: "dashboard-smoke",
    runtime: "browser",
    workspaceLabel: "dashboard",
    inboxMode: "live",
    isHuman: true,
  });
  const joined = await human.joinSpace({
    slug,
    label: "Codex Live Smoke",
    idempotencyKey: randomUUID(),
  });
  human.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: humanSession.sessionId,
    kind: "control",
    type: "orchestrator.designate",
    spaceId: joined.spaceId,
    idempotencyKey: randomUUID(),
    payload: { orchestratorSessionId: codexReadyState.sessionId },
  });

  const summary = await waitFor(async () => {
    const next = await getSpaceSummary(relay.port);
    const codex = next.members?.find(
      (member) =>
        member.sessionId === codexReadyState.sessionId &&
        member.runtime === "codex-cli" &&
        member.inboxMode === "live" &&
        member.presenceState === "online",
    );
    return next.orchestratorSessionId === codexReadyState.sessionId && codex
      ? next
      : undefined;
  }, "Codex live sidecar online orchestrator");

  human.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: humanSession.sessionId,
    kind: "conversation",
    type: "chat.message",
    spaceId: joined.spaceId,
    idempotencyKey: randomUUID(),
    payload: { text: firstMessage },
  });
  await waitFor(
    () => codexPrompts.some((prompt) => prompt.includes(firstMessage)),
    "Codex fake child receiving dashboard message",
  );
  human.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: humanSession.sessionId,
    kind: "conversation",
    type: "chat.message",
    spaceId: joined.spaceId,
    idempotencyKey: randomUUID(),
    payload: { text: secondMessage },
  });

  const expectedReply = `fake codex live reply: ${firstMessage}`;
  const transcriptProof = await waitFor(() => {
    const tail = readTranscriptTail();
    const sawHumanMessage = tail.some(
      (row) =>
        row.envelope?.sessionId === humanSession.sessionId &&
        row.envelope?.type === "chat.message" &&
        row.envelope?.effectiveTo === codexReadyState.sessionId &&
        row.envelope?.payload?.text === firstMessage,
    );
    const sawCodexReply = tail.some(
      (row) =>
        row.envelope?.sessionId === codexReadyState.sessionId &&
        row.envelope?.type === "chat.message" &&
        row.envelope?.payload?.text === expectedReply,
    );
    const sawBlocked = tail.some(
      (row) =>
        row.envelope?.sessionId === codexReadyState.sessionId &&
        row.envelope?.type === "metadata.patch" &&
        row.envelope?.payload?.patch?.progress === "blocked" &&
        String(row.envelope?.payload?.patch?.blockedReason ?? "").includes(
          "already running",
        ),
    );
    return sawHumanMessage && sawCodexReply && sawBlocked
      ? { sawHumanMessage, sawCodexReply, sawBlocked }
      : undefined;
  }, "transcript containing live reply and reentry blocked metadata");

  human.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: humanSession.sessionId,
    kind: "control",
    type: "space.archive",
    spaceId: joined.spaceId,
    idempotencyKey: randomUUID(),
    payload: { slug },
  });

  const lifecycleProof = await Promise.race([
    codexRun.then(() => ({ sidecarExitedAfterArchive: true })),
    new Promise((resolve) => {
      setTimeout(() => resolve(undefined), 3000);
    }),
  ]);
  if (!lifecycleProof) {
    throw new Error("Codex sidecar did not exit after space archive");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        codexSessionId: codexReadyState.sessionId,
        dashboardSessionId: humanSession.sessionId,
        codexPromptCount: codexPrompts.length,
        rosterProof: {
          memberCount: summary.memberCount,
          codexIsLiveOrchestrator:
            summary.orchestratorSessionId === codexReadyState.sessionId,
        },
        transcriptProof,
        lifecycleProof,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        slug,
        error: formatError(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  human?.close();
  abort.abort();
  await codexRun?.catch(() => {});
  if (relay) {
    await stopRelay({ dataDir }).catch(() => {});
  }
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
}
