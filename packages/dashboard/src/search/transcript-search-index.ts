import MiniSearch from "minisearch";

import type { DashboardStore, TranscriptLine } from "../store/dashboard-store.js";
import { previewPayload } from "../transcript/payload-preview.js";

export type TranscriptSearchDoc = {
  id: string;
  sender: string;
  type: string;
  kind: string;
  payloadPreview: string;
};

export { PREVIEW_MAX } from "../transcript/payload-preview.js";

export function previewPayloadForSearch(
  payload: Record<string, unknown>,
): string {
  return previewPayload(payload);
}

function senderForIndex(
  sessionId: string,
  roster: DashboardStore["roster"],
): string {
  const rosterRow = roster.get(sessionId);
  return (
    rosterRow?.displayName ??
    (sessionId.length > 8 ? `${sessionId.slice(0, 8)}…` : sessionId)
  );
}

export function buildTranscriptSearchDoc(
  line: TranscriptLine,
  roster: DashboardStore["roster"],
): TranscriptSearchDoc {
  const env = line.envelope;
  return {
    id: line.dedupeKey,
    sender: senderForIndex(env.sessionId, roster),
    type: env.type,
    kind: env.kind,
    payloadPreview: previewPayload(env.payload as Record<string, unknown>),
  };
}

export function createTranscriptMiniSearch(): MiniSearch<TranscriptSearchDoc> {
  return new MiniSearch<TranscriptSearchDoc>({
    fields: ["sender", "type", "payloadPreview", "kind"],
    storeFields: ["id"],
    searchOptions: {
      boost: { sender: 2, type: 1.5 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
}
