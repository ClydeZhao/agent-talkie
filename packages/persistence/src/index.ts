export { openDatabase } from "./db.js";
export { migrate } from "./migrate.js";
export {
  getCollaborationMetadataSnapshot,
  getOrchestratorSessionId,
  setOrchestratorSessionId,
  upsertCollaborationProfile,
  upsertCollaborationStatus,
  type CollaborationMetadataSnapshot,
} from "./repositories/collaboration-metadata.js";
export {
  createSession,
  disambiguateDisplayName,
  getSessionById,
  type NewSessionInput,
  validateSessionFields,
} from "./repositories/sessions.js";
export {
  pruneExpiredIdempotencyKeys,
  runConversationIdempotentTranscriptAppend,
  tryRecordIdempotencyKey,
} from "./repositories/idempotency.js";
export type { ConversationIdempotencyOutcome } from "./repositories/idempotency.js";
export {
  clearMembershipLeftAt,
  countActiveMembers,
  deleteSpaceById,
  findActiveMembershipForSession,
  getSpaceBySlug,
  insertMembership,
  insertSpaceWithSlug,
  markMembershipLeft,
  normalizeSpaceSlug,
  reviveSpaceFromArchived,
  setSpaceArchived,
  type SpaceStatus,
} from "./repositories/spaces.js";
export {
  getSpaceOwnerSessionId,
  tryAssignSpaceOwnerIfUnsetForHuman,
} from "./repositories/space-owner.js";
export {
  appendTranscriptEntry,
  listTranscriptEntriesAfterSeq,
  listTranscriptTailBySeq,
  nextRelaySeq,
} from "./repositories/transcript.js";
export {
  getOversightSpaceSummaryBySlug,
  listOversightBlockedSessionsBySlug,
  listOversightSpaces,
  listOversightTranscriptTailBySlug,
  type OversightBlockedSession,
  type OversightMember,
  type OversightSpaceListRow,
  type OversightSpaceSummary,
} from "./repositories/oversight.js";
