import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { upsertCollaborationStatus } from "./collaboration-metadata.js";
import { createSession } from "./sessions.js";
import {
  getOversightSpaceSummaryBySlug,
  listOversightBlockedSessionsBySlug,
  listOversightSpaces,
  listOversightTranscriptTailBySlug,
} from "./oversight.js";
import {
  insertMembership,
  insertSpaceWithSlug,
  markMembershipLeft,
  setSpaceArchived,
} from "./spaces.js";
import { appendTranscriptEntry } from "./transcript.js";

describe("oversight repository", () => {
  it("getOversightSpaceSummaryBySlug returns summary for space alpha with two members", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = 1_700_000_000_000;

    const { id: s1 } = createSession(db, {
      displayName: "Alice",
      runtime: "r1",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: s2 } = createSession(db, {
      displayName: "Bob",
      runtime: "r2",
      workspaceLabel: "w",
      isHuman: false,
    });
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "alpha",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: s1, nowMs: now });
    insertMembership(db, { spaceId, sessionId: s2, nowMs: now });

    const summary = getOversightSpaceSummaryBySlug(db, "alpha");
    expect(summary).toBeDefined();
    expect(summary!.slug).toBe("alpha");
    expect(summary!.spaceId).toBe(spaceId);
    expect(summary!.memberCount).toBeGreaterThanOrEqual(2);
    expect(summary!.members.length).toBeGreaterThanOrEqual(2);
    expect("ownerSessionId" in summary!).toBe(true);
    expect(summary!.orchestratorSessionId).toBeNull();

    const byName = new Map(
      summary!.members.map((m) => [m.displayName, m] as const),
    );
    const alice = byName.get("Alice");
    const bob = byName.get("Bob");
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    for (const m of [alice!, bob!]) {
      expect(m).toHaveProperty("runtime");
      expect(m).toHaveProperty("workspaceLabel");
    }
    expect(alice!.runtime).toBe("r1");
    expect(alice!.workspaceLabel).toBe("w");
    expect(bob!.runtime).toBe("r2");
    expect(bob!.workspaceLabel).toBe("w");
  });

  it("listOversightTranscriptTailBySlug returns at most limit entries oldest-first with createdAtMs", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = 1_700_000_000_000;

    const { id: sessionId } = createSession(db, {
      displayName: "sender",
      runtime: "r",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "alpha",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId, nowMs: now });

    for (let i = 0; i < 5; i += 1) {
      appendTranscriptEntry(db, {
        spaceId,
        senderSessionId: sessionId,
        envelopeJson: JSON.stringify({ seq: i }),
        kind: "conversation",
        nowMs: now + i * 1000,
      });
    }

    const tail = listOversightTranscriptTailBySlug(db, {
      slug: "alpha",
      limit: 3,
    });
    expect(tail.length).toBe(3);
    expect(tail[0]!.relaySeq).toBeLessThan(tail[1]!.relaySeq);
    expect(tail[1]!.relaySeq).toBeLessThan(tail[2]!.relaySeq);
    for (const e of tail) {
      expect(typeof e.createdAtMs).toBe("number");
      expect(e.envelopeJson).toBeTruthy();
    }
  });

  it("listOversightBlockedSessionsBySlug returns only blocked sessions", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = 1_700_000_000_000;

    const { id: blockedSession } = createSession(db, {
      displayName: "BlockedBot",
      runtime: "r",
      workspaceLabel: "w",
    });
    const { id: workingSession } = createSession(db, {
      displayName: "Worker",
      runtime: "r",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "alpha",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId: blockedSession, nowMs: now });
    insertMembership(db, { spaceId, sessionId: workingSession, nowMs: now });

    upsertCollaborationStatus(db, {
      spaceId,
      sessionId: blockedSession,
      patch: { progress: "blocked", blockedReason: "waiting on API" },
      nowMs: now,
    });
    upsertCollaborationStatus(db, {
      spaceId,
      sessionId: workingSession,
      patch: { progress: "working" },
      nowMs: now,
    });

    const blocked = listOversightBlockedSessionsBySlug(db, "alpha");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.sessionId).toBe(blockedSession);
    expect(blocked[0]!.blockedReason).toBe("waiting on API");
  });

  it("listOversightSpaces returns active spaces sorted by slug with correct member counts", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = 1_700_000_000_000;

    const { id: sAlpha1 } = createSession(db, {
      displayName: "A1",
      runtime: "r",
      workspaceLabel: "w",
      isHuman: true,
    });
    const { id: sAlpha2 } = createSession(db, {
      displayName: "A2",
      runtime: "r",
      workspaceLabel: "w",
    });
    const { id: sBeta } = createSession(db, {
      displayName: "B1",
      runtime: "r",
      workspaceLabel: "w",
    });
    const { id: sGamma } = createSession(db, {
      displayName: "Gone",
      runtime: "r",
      workspaceLabel: "w",
    });

    const { id: idBeta } = insertSpaceWithSlug(db, {
      slug: "beta",
      nowMs: now,
    });
    const { id: idAlpha } = insertSpaceWithSlug(db, {
      slug: "alpha",
      nowMs: now,
    });
    const { id: idArchived } = insertSpaceWithSlug(db, {
      slug: "z-archived",
      nowMs: now,
    });

    insertMembership(db, { spaceId: idAlpha, sessionId: sAlpha1, nowMs: now });
    insertMembership(db, { spaceId: idAlpha, sessionId: sAlpha2, nowMs: now });
    insertMembership(db, { spaceId: idBeta, sessionId: sBeta, nowMs: now });
    insertMembership(db, { spaceId: idBeta, sessionId: sGamma, nowMs: now });
    markMembershipLeft(db, idBeta, sGamma, now + 1);

    setSpaceArchived(db, idArchived, now + 2);

    const list = listOversightSpaces(db);
    expect(list).toHaveLength(2);
    expect(list[0]!.slug).toBe("alpha");
    expect(list[0]!.memberCount).toBe(2);
    expect(list[1]!.slug).toBe("beta");
    expect(list[1]!.memberCount).toBe(1);
    expect(list.some((r) => r.slug === "z-archived")).toBe(false);
  });
});
