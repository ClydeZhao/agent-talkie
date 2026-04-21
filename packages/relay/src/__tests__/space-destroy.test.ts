import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { handleSpaceDestroy } from "../space-lifecycle.js";

describe("handleSpaceDestroy", () => {
  it("owner human destroys space: rows removed and closeSessionIds lists active members", () => {
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
      .prepare(`SELECT id FROM spaces WHERE slug = ?`)
      .get("destroy-me") as { id: string } | undefined;
    expect(row).toBeUndefined();
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
