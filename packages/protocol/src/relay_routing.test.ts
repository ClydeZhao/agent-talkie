import { describe, expect, it } from "vitest";
import type { MessageEnvelope } from "./envelope.js";
import { relayRouteFamilyFromKey, relayRouteKeyFromEnvelope } from "./relay_routing.js";

function minimalEnvelope(
  overrides: Pick<MessageEnvelope, "type" | "space_id" | "thread_id">,
): MessageEnvelope {
  return {
    schema_version: 1,
    message_id: "550e8400-e29b-41d4-a716-446655440000",
    idempotency_key: "k",
    sender_session_id: "s",
    timestamp: "2026-01-01T00:00:00.000Z",
    payload: null,
    ...overrides,
  };
}

describe("relay_routing", () => {
  it("relayRouteKeyFromEnvelope for control uses space_id only in key", () => {
    const key = relayRouteKeyFromEnvelope(
      minimalEnvelope({ type: "control", space_id: "sp1", thread_id: "t1" }),
    );
    expect(key).toBe("talkie:v1:control:sp1");
  });

  it("relayRouteKeyFromEnvelope for conversation includes space_id and thread_id", () => {
    const key = relayRouteKeyFromEnvelope(
      minimalEnvelope({ type: "conversation", space_id: "sp1", thread_id: "th1" }),
    );
    expect(key).toBe("talkie:v1:conversation:sp1:th1");
  });

  it('relayRouteFamilyFromKey returns "control" for control route keys', () => {
    expect(relayRouteFamilyFromKey("talkie:v1:control:sp1")).toBe("control");
  });

  it('relayRouteFamilyFromKey returns "conversation" for conversation route keys', () => {
    expect(relayRouteFamilyFromKey("talkie:v1:conversation:sp1:th1")).toBe("conversation");
  });

  it("relayRouteFamilyFromKey returns null for unrelated keys", () => {
    expect(relayRouteFamilyFromKey("other")).toBe(null);
  });
});
