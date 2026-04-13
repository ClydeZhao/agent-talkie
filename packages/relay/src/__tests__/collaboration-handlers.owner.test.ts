import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Envelope } from "@agent-talkie/protocol";
import {
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import WebSocketImpl from "ws";
import { handleCollaborationControl } from "../collaboration-handlers.js";
import type { RelayDispatchContext } from "../server.js";
import { SessionRegistry } from "../session-registry.js";

function captureWs(): WebSocketImpl & { sent: string[] } {
  const sent: string[] = [];
  const ws = {
    sent,
    readyState: WebSocketImpl.OPEN,
    OPEN: WebSocketImpl.OPEN,
    send(data: string | Buffer) {
      sent.push(typeof data === "string" ? data : data.toString("utf8"));
    },
  };
  return ws as unknown as WebSocketImpl & { sent: string[] };
}

describe("collaboration orchestrator space owner", () => {
  it("non-owner human orchestrator.designate receives not_space_owner", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idH1 = randomUUID();
    const idH2 = randomUUID();
    const idA = randomUUID();
    createSession(
      db,
      {
        displayName: "h1",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idH1 },
    );
    createSession(
      db,
      {
        displayName: "h2",
        runtime: "t",
        workspaceLabel: "w2",
        isHuman: true,
      },
      { id: idH2 },
    );
    createSession(
      db,
      { displayName: "ag", runtime: "t", workspaceLabel: "w" },
      { id: idA },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "owner-gate",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idH1, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idH2, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idA, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idH1,
      spaceId,
    );

    const ws = captureWs();
    const registry = new SessionRegistry();
    const ctx: RelayDispatchContext = {
      db,
      ws,
      registry,
      boundSessionId: idH2,
      negotiatedVersion: 1,
    };

    const envelope: Envelope = {
      version: 1,
      id: randomUUID(),
      sessionId: idH2,
      kind: "control",
      type: "orchestrator.designate",
      spaceId,
      idempotencyKey: randomUUID(),
      payload: { orchestratorSessionId: idA },
    };

    handleCollaborationControl(ctx, envelope);
    expect(ws.sent.length).toBeGreaterThan(0);
    expect(ws.sent[0]).toContain('"error":"not_space_owner"');
  });
});
