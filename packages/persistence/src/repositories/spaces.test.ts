import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { createSession } from "./sessions.js";
import {
  countActiveMembers,
  getSpaceBySlug,
  insertMembership,
  insertSpaceWithSlug,
  markSpaceDestroyed,
  normalizeSpaceSlug,
  setSpaceIdle,
} from "./spaces.js";

describe("spaces repository", () => {
  it("normalizeSpaceSlug accepts hyphenated slug", () => {
    expect(normalizeSpaceSlug("  Review-Auth  ")).toBe("review-auth");
  });

  it("normalizeSpaceSlug rejects invalid pattern", () => {
    expect(() => normalizeSpaceSlug("bad--slug")).toThrow(/Invalid space slug:/);
  });

  it("stores v3 lifecycle state and a human-usable label", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = 1_700_000_000_000;

    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "planning-room",
      nowMs: now,
      label: "Planning Room",
    });

    expect(getSpaceBySlug(db, "planning-room")).toMatchObject({
      id: spaceId,
      slug: "planning-room",
      label: "Planning Room",
      status: "active",
      archivedAt: null,
      destroyedAt: null,
    });

    setSpaceIdle(db, spaceId);
    expect(getSpaceBySlug(db, "planning-room")?.status).toBe("idle");

    markSpaceDestroyed(db, spaceId, now + 1);
    expect(getSpaceBySlug(db, "planning-room")).toMatchObject({
      id: spaceId,
      status: "destroyed",
      destroyedAt: now + 1,
    });
  });
});

describe("SPACE-03 file DB reopen", () => {
  const dbPath = join(tmpdir(), `talkie-spaces-${randomUUID()}.db`);

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it("space and membership survive close and reopen", () => {
    const slug = normalizeSpaceSlug(`persist-${randomUUID().slice(0, 8)}`);
    const now = Date.now();

    let db = openDatabase(dbPath);
    migrate(db);
    const { id: sessionId } = createSession(db, {
      displayName: "s1",
      runtime: "cursor",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, { slug, nowMs: now });
    insertMembership(db, { spaceId, sessionId, nowMs: now });

    const beforeSlug = getSpaceBySlug(db, slug);
    const beforeCount = countActiveMembers(db, spaceId, now);
    expect(beforeSlug?.id).toBe(spaceId);
    expect(beforeCount).toBe(1);

    db.close();

    db = openDatabase(dbPath);
    migrate(db);

    const afterSlug = getSpaceBySlug(db, slug);
    const afterCount = countActiveMembers(db, spaceId, now);
    expect(afterSlug?.id).toBe(spaceId);
    expect(afterCount).toBe(1);

    db.close();
  });
});
