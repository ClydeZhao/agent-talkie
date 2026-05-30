import {
  formatEnvelopeIssues,
  safeParseEnvelope,
  type Envelope,
} from "@agent-talkie/protocol";

export function parseAndValidateEnvelope(rawJson: unknown):
  | { ok: true; envelope: Envelope }
  | { ok: false; issues: Array<{ path: string; message: string }> } {
  const result = safeParseEnvelope(rawJson);
  if (result.success) {
    return { ok: true, envelope: result.data };
  }
  return { ok: false, issues: formatEnvelopeIssues(result).issues };
}
