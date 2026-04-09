export const PROTOCOL_PACKAGE_VERSION = "0.0.0";

export * from "./envelope.js";
export * from "./errors.js";
export * from "./idempotency.js";
export {
  RELAY_ROUTE_VERSION,
  RELAY_ROUTE_PREFIX,
  RELAY_SEGMENT_CONTROL,
  RELAY_SEGMENT_CONVERSATION,
  relayRouteFamilyFromKey,
  relayRouteKeyFromEnvelope,
} from "./relay_routing.js";
