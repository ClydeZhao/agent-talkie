import { describe, expect, it } from "vitest";
import { formatPossiblyBlockedLabel } from "./format.js";
import { inferPossiblyBlockedSessionIds } from "./possibly-blocked.js";

describe("formatPossiblyBlockedLabel", () => {
  it('returns "blocked" when protocol blocked', () => {
    expect(formatPossiblyBlockedLabel(true, false)).toBe("blocked");
    expect(formatPossiblyBlockedLabel(true, true)).toBe("blocked");
  });

  it('returns "possibly-blocked" when inferred only', () => {
    expect(formatPossiblyBlockedLabel(false, true)).toBe("possibly-blocked");
  });

  it("returns empty string when neither", () => {
    expect(formatPossiblyBlockedLabel(false, false)).toBe("");
  });
});

describe("inferPossiblyBlockedSessionIds", () => {
  it("marks assignee possibly blocked when silent after task.assign beyond threshold", () => {
    const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const assignMs = 1000;
    const nowMs = assignMs + 120000 + 1;
    const envelopeJson = JSON.stringify({
      type: "task.assign",
      to: sessionId,
    });

    const transcriptEntries = [
      {
        envelopeJson,
        relaySeq: 1,
        createdAtMs: assignMs,
      },
    ];

    const statusBySession = new Map([
      [
        sessionId,
        {
          progress: "idle",
          updatedAt: 500,
        },
      ],
    ]);

    const result = inferPossiblyBlockedSessionIds({
      transcriptEntries,
      statusBySession,
      nowMs,
    });

    expect(result.has(sessionId)).toBe(true);
  });
});
