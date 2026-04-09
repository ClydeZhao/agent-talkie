import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION_UNSUPPORTED_CODE } from "./errors.js";
import { parseEnvelope, VALIDATION_ERROR_CODE } from "./envelope.js";

describe("parseEnvelope", () => {
  const base = {
    schema_version: 1,
    message_id: "550e8400-e29b-41d4-a716-446655440000",
    idempotency_key: "idem-1",
    thread_id: "thread-1",
    sender_session_id: "session-1",
    space_id: "space-1",
    type: "conversation" as const,
    timestamp: "2026-04-09T12:00:00.000Z",
    payload: {},
  };

  it("accepts a valid minimal envelope with schema_version 1", () => {
    const r = parseEnvelope(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.schema_version).toBe(1);
  });

  it("rejects schema_version 2 with SCHEMA_VERSION_UNSUPPORTED", () => {
    const r = parseEnvelope({ ...base, schema_version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(SCHEMA_VERSION_UNSUPPORTED_CODE);
      if (r.error.code === SCHEMA_VERSION_UNSUPPORTED_CODE) {
        expect(r.error.supported_min).toBe(1);
        expect(r.error.supported_max).toBe(1);
        expect(r.error.upgrade_doc_url).toContain("docs/protocol-upgrades.md");
      }
    }
  });

  it("rejects missing message_id with VALIDATION_ERROR", () => {
    const { message_id: _omit, ...rest } = base;
    const r = parseEnvelope(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(VALIDATION_ERROR_CODE);
  });

  it("rejects thread_id containing a dot with VALIDATION_ERROR", () => {
    const r = parseEnvelope({ ...base, thread_id: "bad.thread" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(VALIDATION_ERROR_CODE);
  });
});
