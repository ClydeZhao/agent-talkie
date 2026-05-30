#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runCodexAdapter } from "@agent-talkie/adapter-codex";
import {
  listOversightTranscriptTailBySlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { ensureRelayRunning, stopRelay } from "@agent-talkie/supervisor";

const repoRoot = process.cwd();
const dataDir = mkdtempSync(join(tmpdir(), "agent-talkie-codex-claude-smoke-"));
const claudeMessageText = "ping from claude-code smoke";
let slug = "";

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

    setTimeout(() => {
      const prompt = String(args.at(-1) ?? "");
      codexPrompts.push(prompt);
      child.stdout.write(
        `${JSON.stringify({
          type: "thread.started",
          thread_id: "22222222-2222-4222-8222-222222222222",
        })}\n`,
      );
      child.stdout.write(
        `${JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: `fake codex reply to Claude: ${prompt}`,
          },
        })}\n`,
      );
      child.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.emit("exit", 0, null);
    }, 50);

    return child;
  };
}

function getTextContent(result) {
  const first = result?.content?.[0];
  return typeof first?.text === "string" ? first.text : "";
}

function parseToolJson(result, label) {
  const text = getTextContent(result);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function waitFor(fn, label) {
  let last;
  for (let i = 0; i < 100; i += 1) {
    last = await fn();
    if (last) {
      return last;
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

const previousEnv = {
  AGENT_TALKIE_DATA_DIR: process.env.AGENT_TALKIE_DATA_DIR,
  AGENT_TALKIE_RELAY_PORT: process.env.AGENT_TALKIE_RELAY_PORT,
  TALKIE_CODEX_JOIN_SLUG: process.env.TALKIE_CODEX_JOIN_SLUG,
  TALKIE_CODEX_DISPLAY_NAME: process.env.TALKIE_CODEX_DISPLAY_NAME,
  TALKIE_CODEX_RUNTIME: process.env.TALKIE_CODEX_RUNTIME,
  TALKIE_CODEX_WORKSPACE_LABEL: process.env.TALKIE_CODEX_WORKSPACE_LABEL,
};

let relay;
let mcpClient;
let mcpTransport;
let codexRun;
const abort = new AbortController();

try {
  process.env.AGENT_TALKIE_DATA_DIR = dataDir;
  process.env.AGENT_TALKIE_RELAY_PORT = "0";
  process.env.TALKIE_CODEX_DISPLAY_NAME = "codex-smoke";
  process.env.TALKIE_CODEX_RUNTIME = "adapter-codex";
  process.env.TALKIE_CODEX_WORKSPACE_LABEL = repoRoot;

  relay = await ensureRelayRunning({});
  const childEnv = {
    ...process.env,
    AGENT_TALKIE_DATA_DIR: dataDir,
    AGENT_TALKIE_RELAY_PORT: String(relay.port),
  };

  mcpClient = new McpClient({
    name: "agent-talkie-codex-claude-smoke",
    version: "0.0.0",
  });
  mcpTransport = new StdioClientTransport({
    command: "node",
    args: [join(repoRoot, "packages/adapter-cursor-mcp/dist/mcp-server.js")],
    cwd: repoRoot,
    stderr: "pipe",
    env: {
      ...childEnv,
      TALKIE_MCP_DISPLAY_NAME: "claude-code",
      TALKIE_MCP_RUNTIME: "claude-code",
      TALKIE_MCP_STATE_NAMESPACE: "claude-code",
      TALKIE_MCP_WORKSPACE_LABEL: repoRoot,
      TALKIE_MCP_IS_HUMAN: "0",
    },
  });
  await mcpClient.connect(mcpTransport);

  const invalidJoin = await mcpClient.callTool({
    name: "join_from_prompt",
    arguments: { prompt: "not a Talkie join prompt" },
  });
  const invalidPromptRejected =
    invalidJoin.isError === true &&
    getTextContent(invalidJoin).includes("Could not find a Talkie space slug");
  if (!invalidPromptRejected) {
    throw new Error("join_from_prompt accepted an invalid prompt");
  }

  const created = await mcpClient.callTool({
    name: "create_space",
    arguments: {
      name: "claude-code",
      runtime: "claude-code",
      workspaceLabel: repoRoot,
      creatorOrchestrator: true,
    },
  });
  const createdPayload = parseToolJson(created, "create_space");
  slug = createdPayload.slug;
  const claudeSessionId = createdPayload.sessionId;
  if (
    typeof slug !== "string" ||
    typeof claudeSessionId !== "string" ||
    typeof createdPayload.joinPrompt !== "string" ||
    !createdPayload.joinPrompt.includes(`Space slug: ${slug}`)
  ) {
    throw new Error("create_space did not return a usable product join prompt");
  }

  process.env.TALKIE_CODEX_JOIN_SLUG = slug;
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
  const codexReadyState = await Promise.race([
    codexReady,
    codexRun.then(
      () => {
        throw new Error("Codex adapter exited before ready");
      },
      (error) => {
        throw error;
      },
    ),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Timed out waiting for Codex ready")),
        5000,
      );
    }),
  ]);

  await mcpClient.callTool({
    name: "pull_inbox",
    arguments: { slug, limit: 10, clear: true },
  });

  const summary = await waitFor(async () => {
    const next = await getSpaceSummary(relay.port);
    const runtimes = new Set(next.members?.map((m) => m.runtime));
    return runtimes.has("adapter-codex") &&
      runtimes.has("claude-code") &&
      next.orchestratorSessionId === claudeSessionId
      ? next
      : undefined;
  }, "Codex adapter and active Claude MCP orchestrator in roster");

  const codexMember = summary.members.find(
    (m) =>
      m.sessionId === codexReadyState.sessionId && m.runtime === "adapter-codex",
  );
  const claudeMember = summary.members.find(
    (m) => m.sessionId === claudeSessionId && m.runtime === "claude-code",
  );
  if (!codexMember || !claudeMember) {
    throw new Error("roster did not expose expected Codex and Claude sessions");
  }

  await mcpClient.callTool({
    name: "send_message",
    arguments: {
      slug,
      text: claudeMessageText,
      toSessionId: codexMember.sessionId,
    },
  });

  const codexReceivedClaudeMessage = await waitFor(
    async () => codexPrompts.some((prompt) => prompt.includes(claudeMessageText)),
    "Codex fake spawn receiving Claude message",
  );

  const codexReplyText = `fake codex reply to Claude: ${claudeMessageText}`;
  const claudeInboxText = await waitFor(async () => {
    const result = await mcpClient.callTool({
      name: "pull_inbox",
      arguments: { slug, limit: 10 },
    });
    const text = getTextContent(result);
    return text.includes(codexReplyText) ? text : undefined;
  }, "Claude MCP inbox receiving Codex reply");
  const claudeReceivedCodexReply = claudeInboxText.includes(codexReplyText);

  const transcriptProof = await waitFor(() => {
    const tail = readTranscriptTail();
    const sawClaudeMessage = tail.some(
      (row) =>
        row.envelope?.sessionId === claudeMember.sessionId &&
        row.envelope?.type === "chat.direct" &&
        row.envelope?.to === codexMember.sessionId &&
        row.envelope?.payload?.text === claudeMessageText,
    );
    const sawCodexReply = tail.some(
      (row) =>
        row.envelope?.sessionId === codexMember.sessionId &&
        row.envelope?.type === "chat.direct" &&
        row.envelope?.to === claudeMember.sessionId &&
        row.envelope?.payload?.text === codexReplyText,
    );
    return sawClaudeMessage && sawCodexReply
      ? {
          sawClaudeDirectMessage: sawClaudeMessage,
          sawCodexDirectReply: sawCodexReply,
        }
      : undefined;
  }, "transcript containing directed Claude message and directed Codex reply");

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        codexSessionId: codexMember.sessionId,
        claudeSessionId: claudeMember.sessionId,
        codexReceivedClaudeMessage,
        claudeReceivedCodexReply,
        invalidPromptRejected,
        rosterProof: {
          memberCount: summary.memberCount,
          hasCodex: true,
          hasClaude: true,
          claudeIsOrchestrator: summary.orchestratorSessionId === claudeSessionId,
        },
        transcriptProof,
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
        slug: slug || undefined,
        error: formatError(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await mcpClient?.close().catch(() => {});
  await mcpTransport?.close().catch(() => {});
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
