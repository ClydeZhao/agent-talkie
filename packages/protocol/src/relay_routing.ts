import type { MessageEnvelope } from "./envelope.js";

export const RELAY_ROUTE_VERSION = "v1";
export const RELAY_ROUTE_PREFIX = "talkie:v1";
export const RELAY_SEGMENT_CONTROL = "control";
export const RELAY_SEGMENT_CONVERSATION = "conversation";

export function relayRouteKeyFromEnvelope(envelope: MessageEnvelope): string {
  if (envelope.type === "control") {
    return `${RELAY_ROUTE_PREFIX}:${RELAY_SEGMENT_CONTROL}:${envelope.space_id}`;
  }
  return `${RELAY_ROUTE_PREFIX}:${RELAY_SEGMENT_CONVERSATION}:${envelope.space_id}:${envelope.thread_id}`;
}

export function relayRouteFamilyFromKey(routeKey: string): "control" | "conversation" | null {
  const controlPrefix = `${RELAY_ROUTE_PREFIX}:${RELAY_SEGMENT_CONTROL}:`;
  const conversationPrefix = `${RELAY_ROUTE_PREFIX}:${RELAY_SEGMENT_CONVERSATION}:`;
  if (routeKey.startsWith(controlPrefix)) {
    return "control";
  }
  if (routeKey.startsWith(conversationPrefix)) {
    return "conversation";
  }
  return null;
}
