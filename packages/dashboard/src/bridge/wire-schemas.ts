import { z } from "zod";

export const transcriptCatchupMessageSchema = z.object({
  type: z.literal("transcript.catchup"),
  spaceId: z.string().min(1),
  relaySeq: z.number(),
  envelope: z.unknown(),
});

export type TranscriptCatchupMessage = z.infer<
  typeof transcriptCatchupMessageSchema
>;

/** Wire shape from relay after `session.register` (matches Node `TalkieSessionClient`). */
export const sessionRegisteredWireSchema = z.object({
  type: z.literal("session.registered"),
  sessionId: z.string().uuid(),
  reconnectSecret: z.string().min(1),
  displayName: z.string().min(1),
});

export const spaceJoinedWireSchema = z.object({
  type: z.literal("space.joined"),
  spaceId: z.string(),
});

export const protocolErrorWireSchema = z.object({
  type: z.literal("protocol.error"),
  error: z.string(),
});

export type ProtocolErrorWire = z.infer<typeof protocolErrorWireSchema>;

/** Relay fan-out after `metadata.patch` (not a protocol {@link Envelope}). */
export const collaborationMetadataWireSchema = z.object({
  type: z.literal("collaboration.metadata"),
  spaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  namespace: z.enum(["profile", "status"]),
  patch: z.record(z.string(), z.unknown()),
  updatedAt: z.number(),
});

export type CollaborationMetadataWire = z.infer<
  typeof collaborationMetadataWireSchema
>;
