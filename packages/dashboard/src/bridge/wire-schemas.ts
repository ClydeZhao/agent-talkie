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
