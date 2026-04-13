import { z } from "zod";
import { supportedVersionsSchema } from "./handshake.js";

export const relayClientHandshakeSchema = z.object({
  type: z.literal("handshake"),
  supportedVersions: supportedVersionsSchema,
});

export type RelayClientHandshake = z.infer<typeof relayClientHandshakeSchema>;

export const relayHandshakeAckSchema = z.object({
  type: z.literal("handshake.ack"),
  negotiatedVersion: z.number().int().positive(),
  relay: supportedVersionsSchema,
});

export type RelayHandshakeAck = z.infer<typeof relayHandshakeAckSchema>;

export const relayHandshakeNackSchema = z.object({
  type: z.literal("handshake.nack"),
  error: z.literal("version_mismatch"),
  relay: supportedVersionsSchema,
  message: z.string().min(1),
});

export type RelayHandshakeNack = z.infer<typeof relayHandshakeNackSchema>;

/**
 * `isHuman` is persisted from the registrant without extra auth. v1 trusts the
 * client for localhost relay; optional future auth may harden this (T-04-01-01).
 */
export const sessionRegisterMessageSchema = z.object({
  type: z.literal("session.register"),
  newSession: z.object({
    displayName: z.string().min(1),
    runtime: z.string().min(1),
    workspaceLabel: z.string().min(1),
    branch: z.string().optional(),
    focus: z.string().optional(),
    isHuman: z.boolean().optional().default(false),
  }),
});

export type SessionRegisterMessage = z.infer<typeof sessionRegisterMessageSchema>;

export const sessionResumeMessageSchema = z.object({
  type: z.literal("session.resume"),
  sessionId: z.string().uuid(),
  reconnectSecret: z.string().min(1),
});

export type SessionResumeMessage = z.infer<typeof sessionResumeMessageSchema>;
