import { describe, expect, it } from "vitest";
import {
  relayClientHandshakeSchema,
  relayHandshakeNackSchema,
} from "./relay-wire.js";

describe("relay-wire schemas", () => {
  it("accepts a valid client handshake", () => {
    const parsed = relayClientHandshakeSchema.safeParse({
      type: "handshake",
      supportedVersions: { minVersion: 1, maxVersion: 1 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects supportedVersions when minVersion > maxVersion", () => {
    const parsed = relayClientHandshakeSchema.safeParse({
      type: "handshake",
      supportedVersions: { minVersion: 2, maxVersion: 1 },
    });
    expect(parsed.success).toBe(false);
  });

  it("parses handshake.nack shape", () => {
    const parsed = relayHandshakeNackSchema.safeParse({
      type: "handshake.nack",
      error: "version_mismatch",
      relay: { minVersion: 1, maxVersion: 1 },
      message: "no overlap",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("handshake.nack");
      expect(parsed.data.error).toBe("version_mismatch");
    }
  });
});
