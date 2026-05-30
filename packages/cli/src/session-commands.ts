import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { TalkieSessionClient } from "@agent-talkie/client";
import type { Envelope } from "@agent-talkie/protocol";
import {
  getOversightSpaceSummaryBySlug,
  listOversightSpaces,
  listOversightTranscriptTailBySlug,
} from "@agent-talkie/persistence";
import {
  ensureRelayRunning,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";
import { openRelayDatabase } from "./oversight/db.js";

const CLI_STATE_FILE = "cli-session-state.json";

type CliSessionRecord = {
  sessionId: string;
  reconnectSecret: string;
  displayName: string;
  runtime: string;
  workspaceLabel: string;
  slug: string;
  lastSeenBySlug?: Record<string, number>;
};

type CliState = {
  currentKey?: string;
  sessions: Record<string, CliSessionRecord>;
};

type CliSessionSelector = {
  name?: string;
  runtime?: string;
  workspaceLabel?: string;
};

function statePath(): string {
  return join(resolveAgentTalkieDataDir(), CLI_STATE_FILE);
}

function readState(): CliState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { sessions?: unknown }).sessions === "object" &&
      (parsed as { sessions?: unknown }).sessions !== null
    ) {
      return parsed as CliState;
    }
  } catch {
    /* ignore invalid/missing state */
  }
  return { sessions: {} };
}

function writeState(state: CliState): void {
  const dataDir = resolveAgentTalkieDataDir();
  mkdirSync(dataDir, { recursive: true });
  const path = statePath();
  writeFileSync(path, JSON.stringify(state, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function sessionKey(args: {
  slug: string;
  name: string;
  runtime: string;
  workspaceLabel: string;
}): string {
  return JSON.stringify({
    slug: args.slug,
    name: args.name,
    runtime: args.runtime,
    workspaceLabel: args.workspaceLabel,
  });
}

async function connectClient(): Promise<TalkieSessionClient> {
  const relay = await ensureRelayRunning({});
  const client = new TalkieSessionClient({
    url: `ws://127.0.0.1:${relay.port}`,
  });
  await client.connect();
  return client;
}

async function resumeOrRegister(args: {
  state: CliState;
  key: string;
  name: string;
  runtime: string;
  workspaceLabel: string;
  slug: string;
}): Promise<{ client: TalkieSessionClient; record: CliSessionRecord }> {
  let client = await connectClient();
  const existing = args.state.sessions[args.key];
  if (existing) {
    try {
      const resumed = await client.resume({
        sessionId: existing.sessionId,
        reconnectSecret: existing.reconnectSecret,
      });
      const record = {
        ...existing,
        reconnectSecret: resumed.reconnectSecret,
      };
      args.state.sessions[args.key] = record;
      return { client, record };
    } catch {
      client.close();
      delete args.state.sessions[args.key];
      client = await connectClient();
    }
  }

  const registered = await client.registerSession({
    displayName: args.name,
    runtime: args.runtime,
    workspaceLabel: args.workspaceLabel,
    isHuman: false,
  });
  const record: CliSessionRecord = {
    sessionId: registered.sessionId,
    reconnectSecret: registered.reconnectSecret,
    displayName: registered.displayName,
    runtime: args.runtime,
    workspaceLabel: args.workspaceLabel,
    slug: args.slug,
    lastSeenBySlug: {},
  };
  args.state.sessions[args.key] = record;
  return { client, record };
}

async function joinWithRecord(args: {
  state: CliState;
  key: string;
  name: string;
  runtime: string;
  workspaceLabel: string;
  slug: string;
  label?: string;
  creatorOrchestrator?: boolean;
}): Promise<{
  client: TalkieSessionClient;
  record: CliSessionRecord;
  spaceId: string;
  slug: string;
}> {
  const { client, record } = await resumeOrRegister(args);
  const joinArgs: Parameters<TalkieSessionClient["joinSpace"]>[0] = {
    slug: args.slug,
    idempotencyKey: randomUUID(),
  };
  if (args.label !== undefined) {
    joinArgs.label = args.label;
  }
  if (args.creatorOrchestrator !== undefined) {
    joinArgs.creatorOrchestrator = args.creatorOrchestrator;
  }
  const joined = await client.joinSpace(joinArgs);
  args.state.currentKey = args.key;
  record.slug = joined.slug;
  args.state.sessions[args.key] = record;
  writeState(args.state);
  return { client, record, spaceId: joined.spaceId, slug: joined.slug };
}

function generateSpaceSlug(nowMs = Date.now()): string {
  return `talkie-${nowMs.toString(36)}-${randomUUID().slice(0, 8)}`;
}

function generateSpaceLabel(now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `Talkie Space ${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

function buildJoinPrompt(args: { slug: string; label: string }): string {
  return [
    "Join this local Agent Talkie Space.",
    `Space label: ${args.label}`,
    `Space slug: ${args.slug}`,
    "Use your Agent Talkie runtime tooling to join this slug, then send a short hello/ack to the orchestrator.",
    "Do not ask the human to run low-level join/send/pull transport commands.",
  ].join("\n");
}

function extractSlugFromJoinPrompt(prompt: string): string {
  const explicit = /Space slug:\s*([a-z0-9]+(?:-[a-z0-9]+)*)/i.exec(prompt);
  if (explicit?.[1]) {
    return explicit[1].toLowerCase();
  }
  const uri = /talkie:\/\/space\/([a-z0-9]+(?:-[a-z0-9]+)*)/i.exec(prompt);
  if (uri?.[1]) {
    return uri[1].toLowerCase();
  }
  throw new Error("Could not find a Talkie space slug in the join prompt.");
}

function assertPromptReferencesActiveSpace(slug: string): void {
  const db = openRelayDatabase();
  try {
    const found = listOversightSpaces(db).some((space) => space.slug === slug);
    if (!found) {
      throw new Error(
        `Join prompt references a space that is not active locally: ${slug}`,
      );
    }
  } finally {
    db.close();
  }
}

function getCurrentSession(state: CliState): {
  key: string;
  record: CliSessionRecord;
} {
  const key = state.currentKey;
  if (!key || !state.sessions[key]) {
    throw new Error("No current CLI session. Run `talkie join` first.");
  }
  return { key, record: state.sessions[key]! };
}

function parsedSessionKey(key: string):
  | {
      name?: string;
      runtime?: string;
      workspaceLabel?: string;
      slug?: string;
    }
  | undefined {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as {
        name?: string;
        runtime?: string;
        workspaceLabel?: string;
        slug?: string;
      };
    }
  } catch {
    /* ignore malformed keys */
  }
  return undefined;
}

function selectorProvided(selector: CliSessionSelector): boolean {
  return (
    selector.name !== undefined ||
    selector.runtime !== undefined ||
    selector.workspaceLabel !== undefined
  );
}

function getSelectedSession(
  state: CliState,
  slug: string,
  selector: CliSessionSelector,
): { key: string; record: CliSessionRecord } {
  if (!selectorProvided(selector)) {
    return getCurrentSession(state);
  }

  const matches = Object.entries(state.sessions).filter(([key, record]) => {
    const parsedKey = parsedSessionKey(key);
    if (record.slug !== slug) {
      return false;
    }
    if (
      selector.name !== undefined &&
      record.displayName !== selector.name &&
      parsedKey?.name !== selector.name
    ) {
      return false;
    }
    if (
      selector.runtime !== undefined &&
      record.runtime !== selector.runtime &&
      parsedKey?.runtime !== selector.runtime
    ) {
      return false;
    }
    if (
      selector.workspaceLabel !== undefined &&
      record.workspaceLabel !== selector.workspaceLabel &&
      parsedKey?.workspaceLabel !== selector.workspaceLabel
    ) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) {
    throw new Error(
      `No CLI session matching selector has joined space ${slug}. Run \`talkie join --slug ${slug}\` first.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple CLI sessions match selector in space ${slug}. Add --name, --runtime, or --workspace-label to disambiguate.`,
    );
  }

  const [key, record] = matches[0]!;
  return { key, record };
}

function assertCurrentSessionJoined(record: CliSessionRecord, slug: string): void {
  if (record.slug !== slug) {
    throw new Error(
      `Current CLI session has not joined space ${slug}. Run \`talkie join --slug ${slug}\` first.`,
    );
  }
}

function currentSessionNotJoinedError(slug: string): Error {
  return new Error(
    `Current CLI session has not joined space ${slug}. Run \`talkie join --slug ${slug}\` first.`,
  );
}

function parseTranscriptEnvelope(row: {
  relaySeq: number;
  envelopeJson: string;
  createdAtMs: number;
}): { relaySeq: number; createdAtMs: number; envelope: Envelope } | undefined {
  try {
    const parsed = JSON.parse(row.envelopeJson) as Envelope;
    return {
      relaySeq: row.relaySeq,
      createdAtMs: row.createdAtMs,
      envelope: parsed,
    };
  } catch {
    return undefined;
  }
}

function resolveRecipient(slug: string, to: string | undefined): string | undefined {
  if (!to) {
    return undefined;
  }
  const db = openRelayDatabase();
  try {
    const summary = getOversightSpaceSummaryBySlug(db, slug);
    const byId = summary?.members.find((m) => m.sessionId === to);
    if (byId) {
      return byId.sessionId;
    }
    const byName = summary?.members.find((m) => m.displayName === to);
    if (byName) {
      return byName.sessionId;
    }
  } finally {
    db.close();
  }
  throw new Error(`recipient not found in space ${slug}: ${to}`);
}

export async function runJoinCommand(opts: {
  slug: string;
  name: string;
  runtime: string;
  workspaceLabel?: string;
}): Promise<void> {
  const state = readState();
  const workspaceLabel = opts.workspaceLabel ?? basename(process.cwd());
  const key = sessionKey({
    slug: opts.slug,
    name: opts.name,
    runtime: opts.runtime,
    workspaceLabel,
  });
  const { client, record, spaceId, slug } = await joinWithRecord({
    state,
    key,
    name: opts.name,
    runtime: opts.runtime,
    workspaceLabel,
    slug: opts.slug,
  });
  client.close();
  console.log(
    JSON.stringify({
      ok: true,
      slug,
      spaceId,
      sessionId: record.sessionId,
      displayName: record.displayName,
      runtime: record.runtime,
      workspaceLabel: record.workspaceLabel,
    }),
  );
}

export async function runCreateSpaceCommand(opts: {
  name: string;
  runtime: string;
  workspaceLabel?: string;
  creatorOrchestrator?: boolean;
  dashboardBaseUrl?: string;
}): Promise<{
  ok: true;
  slug: string;
  label: string;
  spaceId: string;
  sessionId: string;
  displayName: string;
  runtime: string;
  workspaceLabel: string;
  orchestratorSessionId: string | null;
  dashboardUrl: string | undefined;
  joinPrompt: string;
}> {
  const state = readState();
  const workspaceLabel = opts.workspaceLabel ?? basename(process.cwd());
  const slug = generateSpaceSlug();
  const label = generateSpaceLabel();
  const key = sessionKey({
    slug,
    name: opts.name,
    runtime: opts.runtime,
    workspaceLabel,
  });
  const { client, record, spaceId } = await joinWithRecord({
    state,
    key,
    name: opts.name,
    runtime: opts.runtime,
    workspaceLabel,
    slug,
    label,
    creatorOrchestrator: opts.creatorOrchestrator,
  });
  client.close();

  const db = openRelayDatabase();
  try {
    const summary = getOversightSpaceSummaryBySlug(db, slug);
    const persistedLabel = summary?.label ?? label;
    const dashboardUrl =
      opts.dashboardBaseUrl === undefined
        ? undefined
        : `${opts.dashboardBaseUrl}?space=${encodeURIComponent(slug)}`;
    return {
      ok: true,
      slug,
      label: persistedLabel,
      spaceId,
      sessionId: record.sessionId,
      displayName: record.displayName,
      runtime: record.runtime,
      workspaceLabel: record.workspaceLabel,
      orchestratorSessionId: summary?.orchestratorSessionId ?? null,
      dashboardUrl,
      joinPrompt: buildJoinPrompt({ slug, label: persistedLabel }),
    };
  } finally {
    db.close();
  }
}

export async function runListActiveSpacesCommand(): Promise<void> {
  const db = openRelayDatabase();
  try {
    console.log(JSON.stringify({ ok: true, spaces: listOversightSpaces(db) }));
  } finally {
    db.close();
  }
}

export async function runJoinFromPromptCommand(opts: {
  prompt: string;
  name: string;
  runtime: string;
  workspaceLabel?: string;
}): Promise<void> {
  const slug = extractSlugFromJoinPrompt(opts.prompt);
  assertPromptReferencesActiveSpace(slug);
  await runJoinCommand({
    slug,
    name: opts.name,
    runtime: opts.runtime,
    workspaceLabel: opts.workspaceLabel,
  });
}

export async function runSendCommand(
  text: string,
  opts: { slug: string; to?: string } & CliSessionSelector,
): Promise<void> {
  const state = readState();
  const { key, record } = getSelectedSession(state, opts.slug, opts);
  assertCurrentSessionJoined(record, opts.slug);
  const {
    client,
    record: joinedRecord,
    spaceId,
    slug,
  } = await joinWithRecord({
    state,
    key,
    name: record.displayName,
    runtime: record.runtime,
    workspaceLabel: record.workspaceLabel,
    slug: opts.slug,
  });
  const to = resolveRecipient(slug, opts.to);
  client.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId: joinedRecord.sessionId,
    kind: "conversation",
    type: "chat.message",
    spaceId,
    payload: { text },
    ...(to ? { to } : {}),
  });
  client.close();
  console.log(JSON.stringify({ ok: true, slug, spaceId, to }));
}

export async function runPullCommand(opts: {
  slug: string;
  clear?: boolean;
  limit: number;
} & CliSessionSelector): Promise<void> {
  const state = readState();
  const { key, record } = getSelectedSession(state, opts.slug, opts);
  assertCurrentSessionJoined(record, opts.slug);
  const lastSeen = record.lastSeenBySlug?.[opts.slug] ?? 0;
  const db = openRelayDatabase();
  try {
    const summary = getOversightSpaceSummaryBySlug(db, opts.slug);
    if (!summary) {
      throw new Error(`space not found: ${opts.slug}`);
    }
    if (!summary.members.some((member) => member.sessionId === record.sessionId)) {
      throw currentSessionNotJoinedError(opts.slug);
    }
    const rows = listOversightTranscriptTailBySlug(db, {
      slug: opts.slug,
      limit: Math.max(opts.limit, 500),
    });
    const items = rows
      .map(parseTranscriptEnvelope)
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .filter((item) => item.relaySeq > lastSeen)
      .filter((item) => item.envelope.sessionId !== record.sessionId)
      .filter(
        (item) =>
          item.envelope.kind === "conversation" &&
          item.envelope.type === "chat.message",
      )
      .filter(
        (item) =>
          item.envelope.to === undefined || item.envelope.to === record.sessionId,
      )
      .slice(0, opts.limit);

    if (opts.clear && items.length > 0) {
      record.lastSeenBySlug = record.lastSeenBySlug ?? {};
      record.lastSeenBySlug[opts.slug] = Math.max(
        ...items.map((item) => item.relaySeq),
      );
      state.sessions[key] = record;
      writeState(state);
    }

    console.log(
      JSON.stringify({
        ok: true,
        slug: opts.slug,
        sessionId: record.sessionId,
        count: items.length,
        items,
      }),
    );
  } finally {
    db.close();
  }
}
