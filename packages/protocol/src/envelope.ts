import { z } from "zod";
import { schemaVersionUnsupported, type SchemaVersionUnsupported } from "./errors.js";

export const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

export const SUPPORTED_SCHEMA_VERSION_MIN = 1;
export const SUPPORTED_SCHEMA_VERSION_MAX = 1;

export const EnvelopeSchema = z.object({
  schema_version: z.number().int().positive(),
  message_id: z.string().uuid(),
  idempotency_key: z.string().min(1),
  thread_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  sender_session_id: z.string().min(1),
  space_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  type: z.enum(["control", "conversation"]),
  timestamp: z.iso.datetime(),
  payload: z.unknown(),
});

export type MessageEnvelope = z.infer<typeof EnvelopeSchema>;

export type ParseEnvelopeError =
  | SchemaVersionUnsupported
  | { code: typeof VALIDATION_ERROR_CODE };

export type ParseEnvelopeResult =
  | { ok: true; envelope: MessageEnvelope }
  | { ok: false; error: ParseEnvelopeError };

export function parseEnvelope(input: unknown): ParseEnvelopeResult {
  const parsed = EnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: VALIDATION_ERROR_CODE } };
  }
  const data = parsed.data;
  if (
    data.schema_version < SUPPORTED_SCHEMA_VERSION_MIN ||
    data.schema_version > SUPPORTED_SCHEMA_VERSION_MAX
  ) {
    return { ok: false, error: schemaVersionUnsupported() };
  }
  return { ok: true, envelope: data };
}
