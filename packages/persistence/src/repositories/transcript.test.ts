import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import { createSession } from "./sessions.js";
import { insertMembership, insertSpaceWithSlug } from "./spaces.js";
import {
  appendTranscriptEntry,
  listTranscriptTailBySeq,
} from "./transcript.js";

describe("transcript repository", () => {
  it("assigns monotonic relaySeq and tail query returns latest first", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const now = Date.now();

    const { id: sessionId } = createSession(db, {
      displayName: "t1",
      runtime: "cursor",
      workspaceLabel: "w",
    });
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "transcript-room",
      nowMs: now,
    });
    insertMembership(db, { spaceId, sessionId, nowMs: now });

    const a = appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: sessionId,
      envelopeJson: '{"seq":1}',
      kind: "conversation",
      nowMs: now,
    });
    const b = appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: sessionId,
      envelopeJson: '{"seq":2}',
      kind: "control",
      nowMs: now + 1,
    });

    expect(a.relaySeq).toBe(1);
    expect(b.relaySeq).toBe(2);

    const tail = listTranscriptTailBySeq(db, { spaceId, limit: 1 });
    expect(tail).toHaveLength(1);
    expect(tail[0].relaySeq).toBe(2);
    expect(tail[0].envelopeJson).toBe('{"seq":2}');
  });
});
