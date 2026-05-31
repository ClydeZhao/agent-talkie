import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TalkieSessionClient } from "@agent-talkie/client";
import {
  getCollaborationMetadataSnapshot,
  getOrchestratorSessionId,
  getOversightSpaceSummaryBySlug,
  getSessionById,
  getSpaceBySlug,
  listTranscriptEntriesAfterSeq,
  listTranscriptTailBySeq,
  listOversightBlockedSessionsBySlug,
  listOversightSpaces,
  listOversightTranscriptTailBySlug,
  migrate,
  normalizeSpaceSlug,
  openDatabase,
} from "@agent-talkie/persistence";
import {
  metadataPatchPayloadSchema,
  safeParseEnvelope,
  type Envelope,
} from "@agent-talkie/protocol";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ensureRelayRunning,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";
import { z } from "zod";

export const DEFAULT_TIMELINE_LIMIT = 50;
const DEFAULT_MCP_STATE_NAMESPACE = "adapter-cursor-mcp";
const SESSION_INBOX_URI = "talkie://session/inbox";
const SESSION_STATE_URI = "talkie://session/state";

type PersistedAttachmentState = {
  sessionId: string;
  reconnectSecret: string;
  slug: string;
  spaceId: string;
  displayName: string;
  runtime: string;
  workspaceLabel: string;
};

type PersistedMcpState = {
  attachments: Record<string, PersistedAttachmentState>;
  transcriptCursors: Record<string, number>;
};

type InboxItem = {
  receivedAtMs: number;
  slug: string;
  receiverSessionId: string;
  envelope: Envelope;
};

type InboxState = {
  items: InboxItem[];
};

export type CreateMcpServerDeps = {
  dbPath?: string;
  client?: TalkieSessionClient;
  createClient?: () => TalkieSessionClient;
  ensureRelay?: typeof ensureRelayRunning;
};

type Attachment = PersistedAttachmentState & {
  client: TalkieSessionClient;
};

function validationError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `validation_error: ${message}` }],
    isError: true,
  };
}

function isAlreadyInSpaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("already_in_space");
}

function resolveDbPath(deps?: CreateMcpServerDeps): string {
  return deps?.dbPath ?? join(resolveAgentTalkieDataDir(), "relay.sqlite");
}

function resolveMcpStateNamespace(): string {
  const raw =
    process.env.TALKIE_MCP_STATE_NAMESPACE ??
    process.env.TALKIE_MCP_RUNTIME ??
    DEFAULT_MCP_STATE_NAMESPACE;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized === "" ? DEFAULT_MCP_STATE_NAMESPACE : normalized;
}

function resolveSessionStatePath(): string {
  return join(
    resolveAgentTalkieDataDir(),
    `${resolveMcpStateNamespace()}-session-state.json`,
  );
}

function resolveInboxStatePath(): string {
  return join(
    resolveAgentTalkieDataDir(),
    `${resolveMcpStateNamespace()}-inbox-state.json`,
  );
}

function loadPersistedMcpState(path: string): PersistedMcpState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { attachments: {}, transcriptCursors: {} };
    }
    const attachments = (parsed as { attachments?: unknown }).attachments;
    if (typeof attachments !== "object" || attachments === null) {
      return { attachments: {}, transcriptCursors: {} };
    }
    const transcriptCursors = (parsed as { transcriptCursors?: unknown })
      .transcriptCursors;
    return {
      attachments: Object.fromEntries(
        Object.entries(attachments as Record<string, unknown>).flatMap(
          ([slug, value]) => {
            if (typeof value !== "object" || value === null) {
              return [];
            }
            const row = value as Partial<PersistedAttachmentState>;
            if (
              typeof row.sessionId !== "string" ||
              typeof row.reconnectSecret !== "string" ||
              typeof row.slug !== "string" ||
              typeof row.spaceId !== "string" ||
              typeof row.displayName !== "string" ||
              typeof row.runtime !== "string" ||
              typeof row.workspaceLabel !== "string"
            ) {
              return [];
            }
            return [
              [
                slug,
                {
                  sessionId: row.sessionId,
                  reconnectSecret: row.reconnectSecret,
                  slug: row.slug,
                  spaceId: row.spaceId,
                  displayName: row.displayName,
                  runtime: row.runtime,
                  workspaceLabel: row.workspaceLabel,
                },
              ],
            ];
          },
        ),
      ),
      transcriptCursors:
        typeof transcriptCursors === "object" && transcriptCursors !== null
          ? Object.fromEntries(
              Object.entries(transcriptCursors as Record<string, unknown>).flatMap(
                ([slug, value]) =>
                  typeof value === "number" && Number.isInteger(value) && value >= 0
                    ? [[slug, value]]
                    : [],
              ),
            )
          : {},
    };
  } catch {
    /* ignore */
  }
  return { attachments: {}, transcriptCursors: {} };
}

function persistMcpState(path: string, state: PersistedMcpState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function loadInboxState(path: string): InboxState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return { items: [] };
    }
    const items = (parsed as { items: unknown[] }).items.flatMap((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { receivedAtMs?: unknown }).receivedAtMs !== "number" ||
        typeof (item as { slug?: unknown }).slug !== "string" ||
        typeof (item as { receiverSessionId?: unknown }).receiverSessionId !==
          "string"
      ) {
        return [];
      }
      const parsedEnvelope = safeParseEnvelope(
        (item as { envelope?: unknown }).envelope,
      );
      if (!parsedEnvelope.success) {
        return [];
      }
      return [
        {
          receivedAtMs: (item as { receivedAtMs: number }).receivedAtMs,
          slug: (item as { slug: string }).slug,
          receiverSessionId: (item as { receiverSessionId: string })
            .receiverSessionId,
          envelope: parsedEnvelope.data,
        },
      ];
    });
    return { items };
  } catch {
    return { items: [] };
  }
}

function persistInboxState(path: string, state: InboxState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function templateVarSlug(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function parseInputSlug(raw: string): string {
  return normalizeSpaceSlug(raw);
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

function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
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
    return normalizeSpaceSlug(explicit[1]);
  }
  const uri = /talkie:\/\/space\/([a-z0-9]+(?:-[a-z0-9]+)*)/i.exec(prompt);
  if (uri?.[1]) {
    return normalizeSpaceSlug(uri[1]);
  }
  throw new Error("Could not find a Talkie space slug in the join prompt.");
}

export function createMcpServer(deps?: CreateMcpServerDeps): McpServer {
  const statePath = resolveSessionStatePath();
  let persistedState = loadPersistedMcpState(statePath);
  const attachmentsBySlug = new Map<string, Promise<Attachment>>();
  const inboxStatePath = resolveInboxStatePath();
  let inboxState = loadInboxState(inboxStatePath);
  const ensureRelay = deps?.ensureRelay ?? ensureRelayRunning;
  let relayPromise: ReturnType<typeof ensureRelay> | null = null;

  const mcp = new McpServer(
    { name: "agent-talkie-mcp", version: "0.0.0" },
    {
      capabilities: {
        resources: {
          subscribe: true,
          listChanged: true,
        },
      },
    },
  );

  function persistInbox(): void {
    persistInboxState(inboxStatePath, inboxState);
  }

  function persistState(): void {
    persistMcpState(statePath, persistedState);
  }

  function notifySessionResourcesUpdated(): void {
    void mcp.server.sendResourceUpdated({ uri: SESSION_INBOX_URI }).catch(() => {
      /* ignore when Cursor has not connected yet */
    });
    void mcp.server.sendResourceUpdated({ uri: SESSION_STATE_URI }).catch(() => {
      /* ignore when Cursor has not connected yet */
    });
  }

  function pushInboxEnvelope(args: {
    slug: string;
    receiverSessionId: string;
    envelope: Envelope;
  }): void {
    const { slug, receiverSessionId, envelope } = args;
    if (inboxState.items.some((item) => item.envelope.id === envelope.id)) {
      return;
    }
    inboxState = {
      items: [
        ...inboxState.items,
        { receivedAtMs: Date.now(), slug, receiverSessionId, envelope },
      ],
    };
    persistInbox();
    notifySessionResourcesUpdated();
  }

  function pullInbox(args: {
    slug?: string;
    limit: number;
    clear: boolean;
  }): InboxItem[] {
    const eligible = args.slug
      ? inboxState.items.filter((item) => item.slug === args.slug)
      : inboxState.items;
    const items = eligible.slice(0, args.limit);
    if (args.clear && items.length > 0) {
      const ids = new Set(items.map((item) => item.envelope.id));
      inboxState = {
        items: inboxState.items.filter((item) => !ids.has(item.envelope.id)),
      };
      persistInbox();
      notifySessionResourcesUpdated();
    }
    return items;
  }

  function latestTranscriptSeq(spaceId: string): number {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return 0;
    }
    const db = openDatabase(dbPath);
    try {
      migrate(db);
      const rows = listTranscriptTailBySeq(db, { spaceId, limit: 1 });
      return rows[0]?.relaySeq ?? 0;
    } finally {
      db.close();
    }
  }

  function shouldDeliverTranscriptEnvelope(
    db: ReturnType<typeof openDatabase>,
    attachment: Attachment | PersistedAttachmentState,
    envelope: Envelope,
  ): boolean {
    if (envelope.spaceId !== attachment.spaceId) {
      return false;
    }
    if (envelope.sessionId === attachment.sessionId) {
      return false;
    }
    const directTarget =
      envelope.to ?? (envelope.kind === "conversation" ? envelope.effectiveTo : undefined);
    if (directTarget !== undefined) {
      return directTarget === attachment.sessionId;
    }
    if (envelope.kind === "conversation") {
      const sender = getSessionById(db, envelope.sessionId);
      if (sender?.isHuman) {
        return getOrchestratorSessionId(db, attachment.spaceId) === attachment.sessionId;
      }
    }
    return true;
  }

  function syncInboxFromTranscript(slug?: string): void {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return;
    }
    const targets =
      slug !== undefined
        ? [[slug, persistedState.attachments[slug]] as const]
        : Object.entries(persistedState.attachments);
    const db = openDatabase(dbPath);
    let cursorChanged = false;
    try {
      migrate(db);
      for (const [targetSlug, attachment] of targets) {
        if (attachment === undefined) {
          continue;
        }
        let afterSeq = persistedState.transcriptCursors[targetSlug] ?? 0;
        for (;;) {
          const rows = listTranscriptEntriesAfterSeq(db, {
            spaceId: attachment.spaceId,
            afterSeq,
            limit: 500,
          });
          if (rows.length === 0) {
            break;
          }
          for (const row of rows) {
            afterSeq = Math.max(afterSeq, row.relaySeq);
            let rawEnvelope: unknown;
            try {
              rawEnvelope = JSON.parse(row.envelopeJson) as unknown;
            } catch {
              continue;
            }
            const parsed = safeParseEnvelope(rawEnvelope);
            if (
              parsed.success &&
              shouldDeliverTranscriptEnvelope(db, attachment, parsed.data)
            ) {
              pushInboxEnvelope({
                slug: targetSlug,
                receiverSessionId: attachment.sessionId,
                envelope: parsed.data,
              });
            }
          }
          persistedState.transcriptCursors[targetSlug] = afterSeq;
          cursorChanged = true;
          if (rows.length < 500) {
            break;
          }
        }
      }
    } finally {
      db.close();
    }
    if (cursorChanged) {
      persistState();
    }
  }

  function resolveSpaceIdFromInput(input: {
    spaceId?: string;
    slug?: string;
  }): string | undefined {
    if (input.spaceId) {
      return input.spaceId;
    }
    if (!input.slug) {
      return undefined;
    }
    const known = persistedState.attachments[input.slug];
    if (known) {
      return known.spaceId;
    }
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return undefined;
    }
    const db = openDatabase(dbPath);
    try {
      migrate(db);
      const space = getSpaceBySlug(db, input.slug);
      if (!space) {
        return undefined;
      }
      return space.id;
    } finally {
      db.close();
    }
  }

  function identityForAttachment(args: {
    persisted?: PersistedAttachmentState;
    name?: string;
    runtime?: string;
    workspaceLabel?: string;
  }): {
    displayName: string;
    runtime: string;
    workspaceLabel: string;
    inboxMode: "live" | "pull";
    isHuman: boolean;
  } {
    return {
      displayName:
        args.name ??
        args.persisted?.displayName ??
        process.env.TALKIE_MCP_DISPLAY_NAME ??
        "cursor-mcp-adapter",
      runtime:
        args.runtime ??
        args.persisted?.runtime ??
        process.env.TALKIE_MCP_RUNTIME ??
        "adapter-cursor-mcp",
      workspaceLabel:
        args.workspaceLabel ??
        args.persisted?.workspaceLabel ??
        process.env.TALKIE_MCP_WORKSPACE_LABEL ??
        ".",
      inboxMode:
        process.env.TALKIE_MCP_INBOX_MODE === "live" ? "live" : "pull",
      isHuman: process.env.TALKIE_MCP_IS_HUMAN === "0" ? false : true,
    };
  }

  async function connectClient(): Promise<TalkieSessionClient> {
    const client =
      deps?.createClient?.() ??
      deps?.client ??
      new TalkieSessionClient({
        url: `ws://127.0.0.1:${(await (relayPromise ??= ensureRelay({}))).port}`,
      });
    await client.connect();
    return client;
  }

  async function registerAttachment(args: {
    client: TalkieSessionClient;
    name?: string;
    runtime?: string;
    workspaceLabel?: string;
    persisted?: PersistedAttachmentState;
  }): Promise<{
    sessionId: string;
    reconnectSecret: string;
    displayName: string;
    runtime: string;
    workspaceLabel: string;
  }> {
    const identity = identityForAttachment({
      persisted: args.persisted,
      name: args.name,
      runtime: args.runtime,
      workspaceLabel: args.workspaceLabel,
    });
    const registered = await args.client.registerSession(identity);
    return {
      sessionId: registered.sessionId,
      reconnectSecret: registered.reconnectSecret,
      displayName: registered.displayName,
      runtime: identity.runtime,
      workspaceLabel: identity.workspaceLabel,
    };
  }

  function hasKnownAttachment(slug: string): boolean {
    return (
      attachmentsBySlug.has(slug) ||
      persistedState.attachments[slug] !== undefined
    );
  }

  function findSlugBySpaceId(spaceId: string): string | undefined {
    for (const [slug, attachment] of Object.entries(persistedState.attachments)) {
      if (attachment.spaceId === spaceId) {
        return slug;
      }
    }
    return undefined;
  }

  async function ensureAttachment(args: {
    slug: string;
    label?: string;
    createIfMissing: boolean;
    name?: string;
    runtime?: string;
    workspaceLabel?: string;
    creatorOrchestrator?: boolean;
  }): Promise<Attachment> {
    const existing = attachmentsBySlug.get(args.slug);
    if (existing) {
      return existing;
    }

    const persisted = persistedState.attachments[args.slug];
    if (!persisted && !args.createIfMissing) {
      throw new Error(`not_joined:${args.slug}`);
    }

    const promise = (async (): Promise<Attachment> => {
      let client = await connectClient();
      let session:
        | {
            sessionId: string;
            reconnectSecret: string;
            displayName: string;
            runtime: string;
            workspaceLabel: string;
          }
        | undefined;

      if (persisted) {
        try {
          const resumed = await client.resume({
            sessionId: persisted.sessionId,
            reconnectSecret: persisted.reconnectSecret,
          });
          session = {
            sessionId: resumed.sessionId,
            reconnectSecret: resumed.reconnectSecret,
            displayName: persisted.displayName,
            runtime: persisted.runtime,
            workspaceLabel: persisted.workspaceLabel,
          };
        } catch {
          client.close();
          client = await connectClient();
        }
      }

      if (!session) {
        session = await registerAttachment({
          client,
          name: args.name,
          runtime: args.runtime,
          workspaceLabel: args.workspaceLabel,
          persisted,
        });
      }

      let currentSlug = args.slug;
      client.onEnvelope((envelope) => {
        if (envelope.sessionId === session?.sessionId) {
          return;
        }
        if (!session) {
          return;
        }
        pushInboxEnvelope({
          slug: currentSlug,
          receiverSessionId: session.sessionId,
          envelope,
        });
      });

      let joined: { spaceId: string; slug: string };
      try {
        joined = await client.joinSpace({
          slug: args.slug,
          idempotencyKey: randomUUID(),
          ...(args.label !== undefined ? { label: args.label } : {}),
          ...(args.creatorOrchestrator !== undefined
            ? { creatorOrchestrator: args.creatorOrchestrator }
            : {}),
        });
      } catch (error) {
        if (!persisted || !isAlreadyInSpaceError(error)) {
          throw error;
        }
        client.close();
        client = await connectClient();
        session = await registerAttachment({
          client,
          name: args.name,
          runtime: args.runtime,
          workspaceLabel: args.workspaceLabel,
          persisted,
        });
        client.onEnvelope((envelope) => {
          if (envelope.sessionId === session?.sessionId) {
            return;
          }
          if (!session) {
            return;
          }
          pushInboxEnvelope({
            slug: currentSlug,
            receiverSessionId: session.sessionId,
            envelope,
          });
        });
        joined = await client.joinSpace({
          slug: args.slug,
          idempotencyKey: randomUUID(),
          ...(args.label !== undefined ? { label: args.label } : {}),
          ...(args.creatorOrchestrator !== undefined
            ? { creatorOrchestrator: args.creatorOrchestrator }
            : {}),
        });
      }

      currentSlug = joined.slug;
      const attachment: Attachment = {
        client,
        sessionId: session.sessionId,
        reconnectSecret: session.reconnectSecret,
        slug: joined.slug,
        spaceId: joined.spaceId,
        displayName: session.displayName,
        runtime: session.runtime,
        workspaceLabel: session.workspaceLabel,
      };
      if (joined.slug !== args.slug) {
        delete persistedState.attachments[args.slug];
        delete persistedState.transcriptCursors[args.slug];
        attachmentsBySlug.delete(args.slug);
      }
      const shouldInitializeCursor =
        persisted === undefined &&
        persistedState.transcriptCursors[joined.slug] === undefined;
      persistedState.attachments[joined.slug] = {
        sessionId: attachment.sessionId,
        reconnectSecret: attachment.reconnectSecret,
        slug: attachment.slug,
        spaceId: attachment.spaceId,
        displayName: attachment.displayName,
        runtime: attachment.runtime,
        workspaceLabel: attachment.workspaceLabel,
      };
      if (shouldInitializeCursor) {
        persistedState.transcriptCursors[joined.slug] = latestTranscriptSeq(
          attachment.spaceId,
        );
      }
      persistState();
      attachmentsBySlug.set(joined.slug, Promise.resolve(attachment));
      notifySessionResourcesUpdated();
      return attachment;
    })().catch((error: unknown) => {
      attachmentsBySlug.delete(args.slug);
      if (persisted === undefined) {
        delete persistedState.attachments[args.slug];
        delete persistedState.transcriptCursors[args.slug];
        persistState();
      }
      throw error;
    });
    attachmentsBySlug.set(args.slug, promise);
    return promise;
  }

  async function ensureKnownAttachments(): Promise<string[]> {
    const results = await Promise.allSettled(
      Object.keys(persistedState.attachments).map(async (slug) => {
        await ensureAttachment({ slug, createIfMissing: false });
        return slug;
      }),
    );
    const slugs = Object.keys(persistedState.attachments);
    return results.flatMap((result, index) =>
      result.status === "rejected" ? [slugs[index] ?? "unknown"] : [],
    );
  }

  async function ensureAttachmentBySpaceId(
    spaceId: string,
  ): Promise<Attachment | undefined> {
    const slug = findSlugBySpaceId(spaceId);
    if (!slug) {
      return undefined;
    }
    return ensureAttachment({ slug, createIfMissing: false });
  }

  const joinSpaceInput = z.object({
    slug: z.string().min(1).max(64),
    name: z.string().min(1).max(128).optional(),
    runtime: z.string().min(1).max(64).optional(),
    workspaceLabel: z.string().min(1).max(256).optional(),
  });
  const createSpaceInput = z.object({
    name: z.string().min(1).max(128).optional(),
    runtime: z.string().min(1).max(64).optional(),
    workspaceLabel: z.string().min(1).max(256).optional(),
    creatorOrchestrator: z.boolean().optional(),
  });
  const joinFromPromptInput = z.object({
    prompt: z.string().min(1).max(12000),
    name: z.string().min(1).max(128).optional(),
    runtime: z.string().min(1).max(64).optional(),
    workspaceLabel: z.string().min(1).max(256).optional(),
  });
  const sendMessageInput = z
    .object({
      spaceId: z.string().uuid().optional(),
      slug: z.string().min(1).max(64).optional(),
      text: z.string().min(1).max(8000),
      toSessionId: z.string().uuid().optional(),
    })
    .refine((value) => value.spaceId !== undefined || value.slug !== undefined, {
      message: "spaceId or slug is required",
      path: ["spaceId"],
    });
  const assignOrchestratorInput = z.object({
    spaceId: z.string().uuid(),
    orchestratorSessionId: z.string().uuid(),
  });
  const updateMetadataInput = z
    .object({
      spaceId: z.string().uuid(),
      namespace: z.enum(["profile", "status"]),
      targetSessionId: z.string().uuid().optional(),
      patch: z.record(z.string(), z.unknown()),
    })
    .superRefine((val, ctx) => {
      if (val.namespace === "status" && val.targetSessionId !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "targetSessionId is only valid for namespace profile",
        });
      }
    });
  const pullInboxInputShape = {
    slug: z.string().min(1).max(64).optional(),
    clear: z.boolean().optional(),
    limit: z.number().int().positive().max(100).optional(),
  };
  const pullInboxInput = z.object(pullInboxInputShape);

  function readOversightSummary(slug: string):
    | ReturnType<typeof getOversightSpaceSummaryBySlug>
    | undefined {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return undefined;
    }
    const db = openDatabase(dbPath);
    try {
      migrate(db);
      return getOversightSpaceSummaryBySlug(db, slug);
    } finally {
      db.close();
    }
  }

  function promptReferencesActiveSpace(slug: string): boolean {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return false;
    }
    const db = openDatabase(dbPath);
    try {
      migrate(db);
      return listOversightSpaces(db).some((space) => space.slug === slug);
    } finally {
      db.close();
    }
  }

  mcp.registerTool(
    "create_space",
    {
      description:
        "Create a local Talkie Space without requiring the human to name it, join this MCP-backed runtime session, and return a dashboard URL plus pasteable join prompt.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = createSpaceInput.safeParse(raw ?? {});
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const relay = await (relayPromise ??= ensureRelay({}));
      const slug = generateSpaceSlug();
      const label = generateSpaceLabel();
      const attachment = await ensureAttachment({
        slug,
        label,
        createIfMissing: true,
        name: parsed.data.name,
        runtime: parsed.data.runtime,
        workspaceLabel: parsed.data.workspaceLabel,
        creatorOrchestrator: parsed.data.creatorOrchestrator ?? true,
      });
      const summary = readOversightSummary(attachment.slug);
      const persistedLabel = summary?.label ?? label;
      const dashboardUrl = `http://127.0.0.1:${relay.port}/dashboard?space=${encodeURIComponent(
        attachment.slug,
      )}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              label: persistedLabel,
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
              displayName: attachment.displayName,
              runtime: attachment.runtime,
              workspaceLabel: attachment.workspaceLabel,
              orchestratorSessionId:
                summary?.orchestratorSessionId ??
                (parsed.data.creatorOrchestrator === false
                  ? null
                  : attachment.sessionId),
              dashboardUrl,
              joinPrompt: buildJoinPrompt({
                slug: attachment.slug,
                label: persistedLabel,
              }),
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "list_active_spaces",
    {
      description:
        "List active and idle local Talkie Spaces with stable labels for runtime-native selection.",
      inputSchema: z.any(),
    },
    async (): Promise<CallToolResult> => {
      const relay = await (relayPromise ??= ensureRelay({}));
      const res = await fetch(
        `http://127.0.0.1:${relay.port}/__agent-talkie/v1/oversight/spaces`,
      );
      if (!res.ok) {
        throw new Error(`Failed to list active spaces: HTTP ${res.status}`);
      }
      const spaces = (await res.json()) as unknown;
      if (!Array.isArray(spaces)) {
        throw new Error("Failed to list active spaces: invalid relay response");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, spaces }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "join_from_prompt",
    {
      description:
        "Join a local Talkie Space from a pasted dashboard join prompt without asking the human to run transport commands.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = joinFromPromptInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      let slug: string;
      try {
        slug = extractSlugFromJoinPrompt(parsed.data.prompt);
      } catch (error) {
        return validationError(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!promptReferencesActiveSpace(slug)) {
        return validationError(
          `Join prompt references a space that is not active locally: ${slug}`,
        );
      }
      const attachment = await ensureAttachment({
        slug,
        createIfMissing: true,
        name: parsed.data.name,
        runtime: parsed.data.runtime,
        workspaceLabel: parsed.data.workspaceLabel,
      });
      const summary = readOversightSummary(attachment.slug);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              label: summary?.label ?? labelFromSlug(attachment.slug),
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
              displayName: attachment.displayName,
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "join_space",
    {
      description: "Connect to the relay and join a space by slug.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = joinSpaceInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      let slug: string;
      try {
        slug = parseInputSlug(parsed.data.slug);
      } catch {
        return validationError("invalid slug");
      }
      const attachment = await ensureAttachment({
        slug,
        createIfMissing: true,
        name: parsed.data.name,
        runtime: parsed.data.runtime,
        workspaceLabel: parsed.data.workspaceLabel,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
              displayName: attachment.displayName,
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "send_message",
    {
      description: "Send a conversation message in a space.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = sendMessageInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      let attachment: Attachment | undefined;
      if (parsed.data.slug !== undefined) {
        let slug: string;
        try {
          slug = parseInputSlug(parsed.data.slug);
        } catch {
          return validationError("invalid slug");
        }
        if (!hasKnownAttachment(slug)) {
          return validationError(
            `current MCP-backed runtime session has not joined space ${slug}`,
          );
        }
        attachment = await ensureAttachment({
          slug,
          createIfMissing: false,
        });
      } else {
        const spaceId = resolveSpaceIdFromInput(parsed.data);
        if (!spaceId) {
          return validationError("unknown spaceId/slug");
        }
        attachment = await ensureAttachmentBySpaceId(spaceId);
        if (!attachment) {
          return validationError(
            "current MCP-backed runtime session has not joined the requested space",
          );
        }
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
        kind: "conversation",
        type:
          parsed.data.toSessionId === undefined ? "chat.message" : "chat.direct",
        spaceId: attachment.spaceId,
        payload: { text: parsed.data.text },
        ...(parsed.data.toSessionId !== undefined
          ? { to: parsed.data.toSessionId }
          : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "assign_orchestrator",
    {
      description: "Designate the orchestrator session for a space (owner-gated on relay).",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = assignOrchestratorInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const attachment = await ensureAttachmentBySpaceId(parsed.data.spaceId);
      if (!attachment) {
        return validationError(
          "current MCP-backed runtime session has not joined the requested space",
        );
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
        kind: "control",
        type: "orchestrator.designate",
        spaceId: parsed.data.spaceId,
        idempotencyKey: randomUUID(),
        payload: { orchestratorSessionId: parsed.data.orchestratorSessionId },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              spaceId: parsed.data.spaceId,
              orchestratorSessionId: parsed.data.orchestratorSessionId,
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "update_metadata",
    {
      description:
        "Patch collaboration profile or status metadata for a session. Self-reported fields may include blockedReason for native tooling blockers; use profile/status patches as appropriate.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = updateMetadataInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const row = parsed.data;
      const payloadIn =
        row.namespace === "profile"
          ? {
              namespace: "profile" as const,
              ...(row.targetSessionId !== undefined
                ? { targetSessionId: row.targetSessionId }
                : {}),
              patch: row.patch,
            }
          : { namespace: "status" as const, patch: row.patch };

      const protocolPayload = metadataPatchPayloadSchema.safeParse(payloadIn);
      if (!protocolPayload.success) {
        return validationError(protocolPayload.error.message);
      }

      const attachment = await ensureAttachmentBySpaceId(row.spaceId);
      if (!attachment) {
        return validationError(
          "current MCP-backed runtime session has not joined the requested space",
        );
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
        kind: "control",
        type: "metadata.patch",
        spaceId: row.spaceId,
        idempotencyKey: randomUUID(),
        payload: protocolPayload.data,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    },
  );

  mcp.registerTool(
    "pull_inbox",
    {
      description:
        "Return pending inbound Talkie envelopes for this MCP-backed runtime session. Use clear=true to acknowledge the returned items.",
      inputSchema: pullInboxInputShape,
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = pullInboxInput.safeParse(raw ?? {});
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      if (parsed.data.slug !== undefined) {
        let slug: string;
        try {
          slug = parseInputSlug(parsed.data.slug);
        } catch {
          return validationError("invalid slug");
        }
        if (!hasKnownAttachment(slug)) {
          return validationError(
            `current MCP-backed runtime session has not joined space ${slug}`,
          );
        }
        await ensureAttachment({
          slug,
          createIfMissing: false,
        });
        parsed.data.slug = slug;
        syncInboxFromTranscript(slug);
      } else {
        await ensureKnownAttachments();
        syncInboxFromTranscript();
      }
      const items = pullInbox({
        slug: parsed.data.slug,
        limit: parsed.data.limit ?? 20,
        clear: parsed.data.clear === true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              count: items.length,
              items,
            }),
          },
        ],
      };
    },
  );

  const resourceMeta = {
    description: "Read-only collaboration snapshot (explicit fetch; not auto-injected).",
  };

  const readJsonResource = (
    uri: URL,
    build: (db: ReturnType<typeof openDatabase>) => unknown,
  ): ReadResourceResult => {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Relay database not found at ${dbPath}. Run the relay once to create relay.sqlite.`,
          },
        ],
      };
    }
    let db: ReturnType<typeof openDatabase> | undefined;
    try {
      db = openDatabase(dbPath);
      migrate(db);
      const data = build(db);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Failed to read ${uri.href}: ${msg}`,
          },
        ],
      };
    } finally {
      db?.close();
    }
  };

  mcp.registerResource(
    "session-inbox",
    SESSION_INBOX_URI,
    {
      description: "Pending inbound Talkie envelopes for this MCP-backed runtime session.",
      mimeType: "application/json",
    },
    async (): Promise<ReadResourceResult> => {
      await ensureKnownAttachments();
      syncInboxFromTranscript();
      return {
        contents: [
          {
            uri: SESSION_INBOX_URI,
            mimeType: "application/json",
            text: JSON.stringify({
              count: inboxState.items.length,
              items: inboxState.items,
            }),
          },
        ],
      };
    },
  );

  mcp.registerResource(
    "session-state",
    SESSION_STATE_URI,
    {
      description: "Cursor Talkie session state, joined slugs, and pending inbox count.",
      mimeType: "application/json",
    },
    async (): Promise<ReadResourceResult> => {
      await ensureKnownAttachments();
      syncInboxFromTranscript();
      const attachments = Object.values(persistedState.attachments);
      return {
        contents: [
          {
            uri: SESSION_STATE_URI,
            mimeType: "application/json",
            text: JSON.stringify({
              attachments,
              joinedSlugs: attachments.map((attachment) => attachment.slug),
              joinedSpaces: Object.fromEntries(
                attachments.map((attachment) => [
                  attachment.slug,
                  attachment.spaceId,
                ]),
              ),
              pendingInboxCount: inboxState.items.length,
            }),
          },
        ],
      };
    },
  );

  mcp.registerResource(
    "space-participants",
    new ResourceTemplate("talkie://space/{slug}/participants", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => {
        const summary = getOversightSpaceSummaryBySlug(db, slug);
        return summary ?? { error: "unknown_slug", slug };
      });
    },
  );

  mcp.registerResource(
    "space-timeline",
    new ResourceTemplate("talkie://space/{slug}/timeline", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => ({
        entries: listOversightTranscriptTailBySlug(db, {
          slug,
          limit: DEFAULT_TIMELINE_LIMIT,
        }),
      }));
    },
  );

  mcp.registerResource(
    "space-metadata",
    new ResourceTemplate("talkie://space/{slug}/metadata", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => {
        const space = getSpaceBySlug(db, slug);
        if (!space) {
          return { error: "unknown_slug", slug };
        }
        return getCollaborationMetadataSnapshot(db, space.id);
      });
    },
  );

  mcp.registerResource(
    "space-blocked",
    new ResourceTemplate("talkie://space/{slug}/blocked", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => ({
        blocked: listOversightBlockedSessionsBySlug(db, slug),
      }));
    },
  );

  return mcp;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  await server.connect(new StdioServerTransport());
}

function isMainModule(): boolean {
  const entry = fileURLToPath(import.meta.url);
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(resolve(argv1)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runMcpServer().catch((err) => {
    process.stderr.write(
      `[agent-talkie-mcp] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
