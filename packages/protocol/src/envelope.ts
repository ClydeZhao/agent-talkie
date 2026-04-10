import { version as uuidVersion } from "uuid";
import { z } from "zod";

export const envelopeSchema = z.object({
  version: z.number().int().positive(),
  id: z.string().uuid(),
  sessionId: z
    .string()
    .uuid()
    .superRefine((val, ctx) => {
      if (uuidVersion(val) !== 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "sessionId must be UUID v7",
        });
      }
    }),
  kind: z.enum(["control", "conversation"]),
  type: z.string().min(1).max(256),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid().optional(),
  seq: z.number().int().nonnegative().optional(),
  to: z.string().uuid().optional(),
  spaceId: z.string().uuid().optional(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

export type SafeParseEnvelopeResult = ReturnType<
  typeof envelopeSchema.safeParse
>;

export function safeParseEnvelope(input: unknown): SafeParseEnvelopeResult {
  return envelopeSchema.safeParse(input);
}

export function parseEnvelope(input: unknown): Envelope {
  return envelopeSchema.parse(input);
}

export function formatEnvelopeIssues(
  result: SafeParseEnvelopeResult,
): { issues: Array<{ path: string; message: string }> } {
  if (result.success) {
    return { issues: [] };
  }
  return {
    issues: result.error.issues.map((issue: z.core.$ZodIssue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  };
}
