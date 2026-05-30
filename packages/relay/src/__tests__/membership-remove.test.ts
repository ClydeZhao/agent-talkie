import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import { handleMembershipRemove } from "../space-lifecycle.js";

describe("handleMembershipRemove", () => {
  it("owner removes another member: target membership is marked left", () => {
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
      slug: "kick-space",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idOther, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const out = handleMembershipRemove(db, {
      sessionId: idOwner,
      spaceId,
      targetSessionId: idOther,
      idempotencyKey: randomUUID(),
      nowMs: now + 1,
    });

    expect(out).toEqual({
      kind: "removed",
      spaceId,
      targetSessionId: idOther,
    });

    const mem = db
      .prepare(
        `SELECT left_at FROM space_memberships WHERE space_id = ? AND session_id = ?`,
      )
      .get(spaceId, idOther) as { left_at: number | null };
    expect(mem.left_at).not.toBeNull();
  });

  it("owner cannot remove a session that is not an active member (target_not_in_space)", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    const idMember = randomUUID();
    const idStranger = randomUUID();
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
        displayName: "member",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idMember },
    );
    createSession(
      db,
      {
        displayName: "stranger",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idStranger },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "missing-target",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idMember, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const out = handleMembershipRemove(db, {
      sessionId: idOwner,
      spaceId,
      targetSessionId: idStranger,
      idempotencyKey: randomUUID(),
      nowMs: now + 1,
    });

    expect(out).toEqual({
      kind: "error",
      error: "target_not_in_space",
    });
  });

  it("non-owner cannot remove the space owner session (not_space_owner)", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const idOwner = randomUUID();
    const idMember = randomUUID();
    createSession(
      db,
      {
        displayName: "owner-session",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idOwner },
    );
    createSession(
      db,
      {
        displayName: "member",
        runtime: "t",
        workspaceLabel: "w",
        isHuman: true,
      },
      { id: idMember },
    );
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "owner-col",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idMember, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOwner,
      spaceId,
    );

    const out = handleMembershipRemove(db, {
      sessionId: idMember,
      spaceId,
      targetSessionId: idOwner,
      idempotencyKey: randomUUID(),
      nowMs: now + 1,
    });

    expect(out).toEqual({
      kind: "error",
      error: "not_space_owner",
    });
  });

  it("cannot remove self (membership_remove_self)", () => {
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
      slug: "self-kick",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: idOwner, nowMs: now });
    insertMembership(db, { spaceId, sessionId: idOther, nowMs: now });
    db.prepare(`UPDATE spaces SET owner_session_id = ? WHERE id = ?`).run(
      idOther,
      spaceId,
    );

    const out = handleMembershipRemove(db, {
      sessionId: idOther,
      spaceId,
      targetSessionId: idOther,
      idempotencyKey: randomUUID(),
      nowMs: now + 1,
    });

    expect(out).toEqual({
      kind: "error",
      error: "membership_remove_self",
    });
  });
});
