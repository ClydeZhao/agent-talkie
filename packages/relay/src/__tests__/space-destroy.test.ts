import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSession,
  appendTranscriptEntry,
  getOrchestratorSessionId,
  getSpaceBySlug,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import {
  handleSpaceArchive,
  handleSpaceDestroy,
  handleSpaceJoin,
  handleSpaceLeave,
  pruneExpiredArchivedSpaces,
} from "../space-lifecycle.js";

describe("handleSpaceJoin product creation", () => {
  it("assigns the creating session as orchestrator when a join creates the space", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const sessionId = randomUUID();
    createSession(
      db,
      {
        displayName: "creator",
        runtime: "codex-cli",
        workspaceLabel: "repo",
      },
      { id: sessionId },
    );

    const out = handleSpaceJoin(db, {
      sessionId,
      idempotencyKey: randomUUID(),
      slugRaw: "created-room",
      label: "Created Room",
      nowMs: now,
      creatorOrchestrator: true,
    });

    expect(out.kind).toBe("joined");
    if (out.kind !== "joined") {
      return;
    }
    expect(getOrchestratorSessionId(db, out.spaceId)).toBe(sessionId);
    expect(getSpaceBySlug(db, "created-room")?.label).toBe("Created Room");
  });

  it("does not assign orchestrator for generic create-by-join", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const sessionId = randomUUID();
    createSession(
      db,
      {
        displayName: "generic",
        runtime: "browser",
        workspaceLabel: "dashboard",
      },
      { id: sessionId },
    );

    const out = handleSpaceJoin(db, {
      sessionId,
      idempotencyKey: randomUUID(),
      slugRaw: "generic-room",
      nowMs: now,
    });

    expect(out.kind).toBe("joined");
    if (out.kind !== "joined") {
      return;
    }
    expect(getOrchestratorSessionId(db, out.spaceId)).toBeNull();
  });
});

describe("handleSpaceLeave", () => {
  it("moves an empty active space to idle before auto-archive policy runs", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const sessionId = randomUUID();
    createSession(
      db,
      {
        displayName: "member",
        runtime: "cli",
        workspaceLabel: "repo",
      },
      { id: sessionId },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "idle-room",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId, nowMs: now });

    const out = handleSpaceLeave(db, {
      sessionId,
      idempotencyKey: randomUUID(),
      nowMs: now + 1,
    });

    expect(out).toEqual({ kind: "left", spaceId });
    expect(getSpaceBySlug(db, "idle-room")?.status).toBe("idle");
  });
});

describe("handleSpaceDestroy", () => {
  it("owner human destroys space: row is marked destroyed and closeSessionIds lists active members", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    const idOther = randomUUID();
    createSession(
      db,
      {
        displayName: "owner",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );
    createSession(
      db,
      {
        displayName: "peer",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOther },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "destroy-me",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idOther, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const key = randomUUID();
    const out = handleSpaceDestroy(db, {
      sessionId: idOwner,
      idempotencyKey: key,
      slugRaw: "destroy-me",
      nowMs: now + 1,
    });

    expect(out.kind).toBe("destroyed");
    if (out.kind !== "destroyed") {
      return;
    }
    expect(out.slug).toBe("destroy-me");
    expect(new Set(out.closeSessionIds)).toEqual(
      new Set([idOwner, idOther]),
    );

    const row = db
      .prepare(`SELECT id, status, destroyed_at FROM spaces WHERE slug = ?`)
      .get("destroy-me") as
      | { id: string; status: string; destroyed_at: number | null }
      | undefined;
    expect(row).toEqual({
      id: spaceId,
      status: "destroyed",
      destroyed_at: now + 1,
    });
  });

  it("non-owner human receives not_space_owner", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    const idIntruder = randomUUID();
    createSession(
      db,
      {
        displayName: "owner",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );
    createSession(
      db,
      {
        displayName: "other",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idIntruder },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "gated",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idIntruder, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const out = handleSpaceDestroy(db, {
      sessionId: idIntruder,
      idempotencyKey: randomUUID(),
      slugRaw: "gated",
      nowMs: now + 1,
    });

    expect(out).toEqual({ kind: "error", error: "not_space_owner" });
    const stillThere = db
      .prepare(`SELECT id FROM spaces WHERE id = ?`)
      .get(spaceId) as { id: string } | undefined;
    expect(stillThere).toBeDefined();
  });

  it("invalid slug returns invalid_slug", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const idOwner = randomUUID();
    createSession(
      db,
      {
        displayName: "owner",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );

    const out = handleSpaceDestroy(db, {
      sessionId: idOwner,
      idempotencyKey: randomUUID(),
      slugRaw: "BAD SLUG!!!",
      nowMs: Date.now(),
    });

    expect(out).toEqual({ kind: "error", error: "invalid_slug" });
  });

  it("idempotent replay after destroy returns destroyed with empty closeSessionIds", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    createSession(
      db,
      {
        displayName: "owner",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "replay-space",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const key = randomUUID();
    const first = handleSpaceDestroy(db, {
      sessionId: idOwner,
      idempotencyKey: key,
      slugRaw: "replay-space",
      nowMs: now + 1,
    });
    expect(first.kind).toBe("destroyed");

    const second = handleSpaceDestroy(db, {
      sessionId: idOwner,
      idempotencyKey: key,
      slugRaw: "replay-space",
      nowMs: now + 2,
    });
    expect(second).toEqual({
      kind: "destroyed",
      slug: "replay-space",
      closeSessionIds: [],
    });
  });
});

describe("handleSpaceArchive", () => {
  it("owner human archives a space without deleting transcript history", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    createSession(
      db,
      {
        displayName: "owner",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "archive-me",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: idOwner,
      envelopeJson: JSON.stringify({ ok: true }),
      kind: "conversation",
      nowMs: now,
    });

    const out = handleSpaceArchive(db, {
      sessionId: idOwner,
      idempotencyKey: randomUUID(),
      slugRaw: "archive-me",
      nowMs: now + 1,
    });

    expect(out.kind).toBe("archived");
    expect(getSpaceBySlug(db, "archive-me")?.status).toBe("archived");
    const transcriptCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?`,
      )
      .get(spaceId) as { n: number };
    expect(transcriptCount.n).toBe(1);
  });
});

describe("pruneExpiredArchivedSpaces", () => {
  it("auto-archives expired idle spaces and preserves transcript history", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const sessionId = randomUUID();
    createSession(
      db,
      {
        displayName: "member",
        runtime: "t",
        workspaceLabel: "w",
      },
      { id: sessionId },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "archived-history",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId, nowMs: now });
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: sessionId,
      envelopeJson: JSON.stringify({ ok: true }),
      kind: "conversation",
      nowMs: now,
    });
    db.prepare(`UPDATE spaces SET status = 'idle', expires_at = ? WHERE id = ?`).run(
      now + 1,
      spaceId,
    );

    pruneExpiredArchivedSpaces(db, now + 10);

    expect(getSpaceBySlug(db, "archived-history")?.status).toBe("archived");
    const transcriptCount = db
      .prepare(
        `SELECT COUNT(*) AS n FROM transcript_entries WHERE space_id = ?`,
      )
      .get(spaceId) as { n: number };
    expect(transcriptCount.n).toBe(1);
  });
});
