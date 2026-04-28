#!/usr/bin/env node
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TalkieSessionClient } from "@agent-talkie/client";
import { runCodexAdapter } from "@agent-talkie/adapter-codex";
import { ensureRelayRunning, stopRelay } from "@agent-talkie/supervisor";

const repoRoot = process.cwd();
const dataDir = mkdtempSync(join(tmpdir(), "agent-talkie-local-smoke-"));
const slug = `local-smoke-${Date.now()}`;

function createFakeCodexSpawn() {
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
      child.stdout.write(
        `${JSON.stringify({
          type: "thread.started",
          thread_id: "11111111-1111-4111-8111-111111111111",
        })}\n`,
      );
      child.stdout.write(
        `${JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: `fake codex reply to: ${prompt}`,
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

async function waitFor(fn, label) {
  let last;
  for (let i = 0; i < 80; i += 1) {
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

const previousEnv = {
  AGENT_TALKIE_DATA_DIR: process.env.AGENT_TALKIE_DATA_DIR,
  AGENT_TALKIE_RELAY_PORT: process.env.AGENT_TALKIE_RELAY_PORT,
  TALKIE_CODEX_JOIN_SLUG: process.env.TALKIE_CODEX_JOIN_SLUG,
  TALKIE_CODEX_DISPLAY_NAME: process.env.TALKIE_CODEX_DISPLAY_NAME,
  TALKIE_CODEX_RUNTIME: process.env.TALKIE_CODEX_RUNTIME,
};

let relay;
let mcpClient;
let mcpTransport;
let human;
let codexRun;
const abort = new AbortController();

try {
  process.env.AGENT_TALKIE_DATA_DIR = dataDir;
  process.env.AGENT_TALKIE_RELAY_PORT = "0";
  process.env.TALKIE_CODEX_JOIN_SLUG = slug;
  process.env.TALKIE_CODEX_DISPLAY_NAME = "codex-smoke";
  process.env.TALKIE_CODEX_RUNTIME = "adapter-codex";

  relay = await ensureRelayRunning({});
  let markCodexReady;
  const codexReady = new Promise((resolve) => {
    markCodexReady = resolve;
  });
  codexRun = runCodexAdapter({
    spawn: createFakeCodexSpawn(),
    signal: abort.signal,
    onReady: markCodexReady,
  });

  mcpClient = new McpClient({ name: "agent-talkie-smoke", version: "0.0.0" });
  mcpTransport = new StdioClientTransport({
    command: "node",
    args: [join(repoRoot, "packages/adapter-cursor-mcp/dist/mcp-server.js")],
    cwd: repoRoot,
    stderr: "pipe",
    env: {
      ...process.env,
      AGENT_TALKIE_DATA_DIR: dataDir,
      AGENT_TALKIE_RELAY_PORT: String(relay.port),
      TALKIE_MCP_DISPLAY_NAME: "cursor-smoke",
      TALKIE_MCP_RUNTIME: "adapter-cursor-mcp",
      TALKIE_MCP_WORKSPACE: repoRoot,
      TALKIE_MCP_IS_HUMAN: "0",
    },
  });
  await mcpClient.connect(mcpTransport);

  await mcpClient.callTool({
    name: "join_space",
    arguments: { slug, name: "cursor-smoke" },
  });
  await mcpClient.callTool({ name: "pull_inbox", arguments: { slug, limit: 1 } });
  await codexReady;

  const summary = await waitFor(async () => {
    const next = await getSpaceSummary(relay.port);
    const runtimes = new Set(next.members?.map((m) => m.runtime));
    return runtimes.has("adapter-codex") && runtimes.has("adapter-cursor-mcp")
      ? next
      : undefined;
  }, "codex and cursor MCP members");

  const codexMember = summary.members.find((m) => m.runtime === "adapter-codex");
  const cursorMember = summary.members.find(
    (m) => m.runtime === "adapter-cursor-mcp",
  );

  human = new TalkieSessionClient({ url: `ws://127.0.0.1:${relay.port}` });
  await human.connect();
  const humanSession = await human.registerSession({
    displayName: "human-smoke",
    runtime: "smoke",
    workspaceLabel: repoRoot,
    isHuman: true,
  });
  const joined = await human.joinSpace({
    slug,
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
    payload: { orchestratorSessionId: codexMember.sessionId },
  });

  await mcpClient.callTool({
    name: "send_message",
    arguments: {
      slug,
      text: "ping from cursor smoke",
      toSessionId: codexMember.sessionId,
    },
  });

  const inbox = await waitFor(async () => {
    const result = await mcpClient.callTool({
      name: "pull_inbox",
      arguments: { slug, limit: 10 },
    });
    const text = getTextContent(result);
    return text.includes("fake codex reply to: ping from cursor smoke")
      ? text
      : undefined;
  }, "Cursor MCP inbox receiving Codex reply");

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        relayPort: relay.port,
        codexSessionId: codexMember.sessionId,
        cursorSessionId: cursorMember.sessionId,
        memberCount: summary.memberCount,
        inboxReceivedCodexReply: inbox.includes("fake codex reply"),
      },
      null,
      2,
    ),
  );

  abort.abort();
  await codexRun;
} finally {
  human?.close();
  await mcpClient?.close().catch(() => {});
  await mcpTransport?.close().catch(() => {});
  abort.abort();
  await codexRun?.catch(() => {});
  if (relay) {
    await stopRelay({}).catch(() => {});
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
