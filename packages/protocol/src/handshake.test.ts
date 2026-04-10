import { describe, expect, it } from "vitest";
import {
  agreeProtocolVersion,
  buildVersionMismatchFailure,
  versionNegotiationFailureSchema,
  versionRangesOverlap,
} from "./handshake.js";

describe("handshake version negotiation", () => {
  it("overlapping ranges agree on min(relay.max, client.max)", () => {
    const client = { minVersion: 1, maxVersion: 1 };
    const relay = { minVersion: 1, maxVersion: 2 };
    expect(versionRangesOverlap(client, relay)).toBe(true);
    expect(agreeProtocolVersion(client, relay)).toBe(1);
  });

  it("throws when ranges do not overlap", () => {
    const client = { minVersion: 2, maxVersion: 2 };
    const relay = { minVersion: 1, maxVersion: 1 };
    expect(versionRangesOverlap(client, relay)).toBe(false);
    expect(() => agreeProtocolVersion(client, relay)).toThrow(
      "No overlapping protocol version range",
    );
  });

  it("buildVersionMismatchFailure produces a valid version_mismatch payload", () => {
    const relay = { minVersion: 1, maxVersion: 2 };
    const failure = buildVersionMismatchFailure(relay);
    const parsed = versionNegotiationFailureSchema.safeParse(failure);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error).toBe("version_mismatch");
    }
  });
});
