import { z } from "zod";

/**
 * Zod contracts for collaboration control payloads (envelope `type` is the API name).
 *
 * - `orchestrator.designate` → {@link orchestratorDesignatePayloadSchema}
 * - `orchestrator.clear` → {@link orchestratorClearPayloadSchema}
 * - `task.assign` → {@link taskAssignPayloadSchema} (assignee from envelope `to`, MSG-06 / D-03)
 * - `metadata.patch` → {@link metadataPatchPayloadSchema}
 * - `metadata.query` → {@link metadataQueryPayloadSchema} (space from envelope.spaceId)
 *
 * Relay resolves profile `targetSessionId` as `payload.targetSessionId ?? envelope.sessionId`.
 * Only `isHuman` senders may set `targetSessionId` ≠ `envelope.sessionId`; target must be an active member (enforced in relay handlers).
 */

export const progressSchema = z.enum(["idle", "working", "blocked", "done"]);
export type Progress = z.infer<typeof progressSchema>;

export const orchestratorDesignatePayloadSchema = z.object({
  orchestratorSessionId: z.string().uuid(),
});
export type OrchestratorDesignatePayload = z.infer<
  typeof orchestratorDesignatePayloadSchema
>;

export const orchestratorClearPayloadSchema = z.object({});
export type OrchestratorClearPayload = z.infer<
  typeof orchestratorClearPayloadSchema
>;

export const taskAssignPayloadSchema = z.object({
  threadId: z.string().min(1).max(256).optional(),
  summary: z.string().min(1).max(4000),
});
export type TaskAssignPayload = z.infer<typeof taskAssignPayloadSchema>;

export const metadataPatchPayloadSchema = z.discriminatedUnion("namespace", [
  z.object({
    namespace: z.literal("profile"),
    targetSessionId: z.string().uuid().optional(),
    patch: z
      .object({
        role: z.string().max(256).optional(),
        focus: z.string().max(512).optional(),
      })
      .strict(),
  }),
  z.object({
    namespace: z.literal("status"),
    patch: z
      .object({
        progress: progressSchema.optional(),
        blockedReason: z.string().max(512).optional(),
        lastActivityMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
  }),
]);
export type MetadataPatchPayload = z.infer<typeof metadataPatchPayloadSchema>;

export const metadataQueryPayloadSchema = z.object({});
export type MetadataQueryPayload = z.infer<typeof metadataQueryPayloadSchema>;
