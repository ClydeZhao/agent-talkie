import { describe, expect, it } from "vitest";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import {
  formatEnvelopeIssues,
  safeParseEnvelope,
} from "./envelope.js";

function baseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: uuidv4(),
    sessionId: uuidv7(),
    kind: "control" as const,
    type: "join",
    payload: {},
    ...overrides,
  };
}

describe("envelopeSchema", () => {
  it("accepts a valid control envelope without idempotencyKey", () => {
    const input = baseEnvelope();
    const result = safeParseEnvelope(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("control");
      expect(result.data.type).toBe("join");
    }
  });

  it("rejects when version is missing", () => {
    const { version: _v, ...rest } = baseEnvelope();
    const result = safeParseEnvelope(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const { issues } = formatEnvelopeIssues(result);
      expect(issues.some((i) => i.path.includes("version"))).toBe(true);
    }
  });

  it("rejects sessionId that is UUID v4", () => {
    const input = baseEnvelope({ sessionId: uuidv4() });
    const result = safeParseEnvelope(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const { issues } = formatEnvelopeIssues(result);
      expect(
        issues.some((i) => i.message.includes("v7")),
      ).toBe(true);
    }
  });

  it("rejects invalid kind", () => {
    const input = baseEnvelope({ kind: "system" });
    const result = safeParseEnvelope(input);
    expect(result.success).toBe(false);
  });

  it("accepts optional idempotencyKey and seq 0", () => {
    const input = baseEnvelope({
      idempotencyKey: uuidv4(),
      seq: 0,
    });
    const result = safeParseEnvelope(input);
    expect(result.success).toBe(true);
  });
});
