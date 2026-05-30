import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { createSession } from "./sessions.js";
import {
  insertMembership,
  insertSpaceWithSlug,
  normalizeSpaceSlug,
} from "./spaces.js";
import {
  getSpaceOwnerSessionId,
  tryAssignSpaceOwnerIfUnsetForHuman,
} from "./space-owner.js";

describe("space-owner repository", () => {
  it("migrate adds owner_session_id column to spaces", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const cols = db
      .prepare(`PRAGMA table_info(spaces)`)
      .all() as { name: string }[];
    expect(cols.some((c) => c.name === "owner_session_id")).toBe(true);
  });

  it("tryAssignSpaceOwnerIfUnsetForHuman returns false and leaves DB unchanged when session is not human", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const slug = normalizeSpaceSlug("bot-only-space");
    const { id: spaceId } = insertSpaceWithSlug(db, { slug, nowMs: now });
    const { id: botId } = createSession(db, {
      displayName: "bot",
      runtime: "cursor",
      workspaceLabel: "w",
      isHuman: false,
    });
    insertMembership(db, { spaceId, sessionId: botId, nowMs: now });

    const before = db
      .prepare(`SELECT owner_session_id FROM spaces WHERE id = ?`)
      .get(spaceId) as { owner_session_id: string | null };
    expect(before.owner_session_id).toBeNull();

    const result = tryAssignSpaceOwnerIfUnsetForHuman(db, {
      spaceId,
      sessionId: botId,
    });
    expect(result).toBe(false);

    const after = db
      .prepare(`SELECT owner_session_id FROM spaces WHERE id = ?`)
      .get(spaceId) as { owner_session_id: string | null };
    expect(after.owner_session_id).toBeNull();
    expect(getSpaceOwnerSessionId(db, spaceId)).toBeNull();
  });

  it("tryAssignSpaceOwnerIfUnsetForHuman sets owner when human and owner_session_id IS NULL", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const slug = normalizeSpaceSlug("human-owner-space");
    const { id: spaceId } = insertSpaceWithSlug(db, { slug, nowMs: now });
    const { id: humanId } = createSession(db, {
      displayName: "human",
      runtime: "cursor",
      workspaceLabel: "w",
      isHuman: true,
    });
    insertMembership(db, { spaceId, sessionId: humanId, nowMs: now });

    const assigned = tryAssignSpaceOwnerIfUnsetForHuman(db, {
      spaceId,
      sessionId: humanId,
    });
    expect(assigned).toBe(true);
    expect(getSpaceOwnerSessionId(db, spaceId)).toBe(humanId);
  });

  it("second human calling tryAssignSpaceOwnerIfUnsetForHuman does not change existing owner", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();
    const slug = normalizeSpaceSlug("two-humans-space");
    const { id: spaceId } = insertSpaceWithSlug(db, { slug, nowMs: now });
    const { id: h1 } = createSession(db, {
      displayName: "h1",
      runtime: "cursor",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: h2 } = createSession(db, {
      displayName: "h2",
      runtime: "cursor",
      workspaceLabel: "w1",
      isHuman: true,
    });
    insertMembership(db, { spaceId, sessionId: h1, nowMs: now });
    insertMembership(db, { spaceId, sessionId: h2, nowMs: now });

    expect(
      tryAssignSpaceOwnerIfUnsetForHuman(db, { spaceId, sessionId: h1 }),
    ).toBe(true);
    expect(getSpaceOwnerSessionId(db, spaceId)).toBe(h1);

    const second = tryAssignSpaceOwnerIfUnsetForHuman(db, {
      spaceId,
      sessionId: h2,
    });
    expect(second).toBe(false);
    expect(getSpaceOwnerSessionId(db, spaceId)).toBe(h1);
  });
});
