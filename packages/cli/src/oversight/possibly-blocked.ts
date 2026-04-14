export const POSSIBLY_BLOCKED_SILENCE_MS = 120000;

export function inferPossiblyBlockedSessionIds(args: {
  transcriptEntries: Array<{
    envelopeJson: string;
    relaySeq: number;
    createdAtMs: number;
  }>;
  statusBySession: Map<string, { progress: string; updatedAt: number }>;
  nowMs: number;
}): Set<string> {
  const sorted = [...args.transcriptEntries].sort(
    (a, b) => a.relaySeq - b.relaySeq,
  );
  const latestAssignMsByAssignee = new Map<string, number>();

  for (const entry of sorted) {
    let envelope: unknown;
    try {
      envelope = JSON.parse(entry.envelopeJson);
    } catch {
      continue;
    }
    if (
      typeof envelope !== "object" ||
      envelope === null ||
      (envelope as { type?: unknown }).type !== "task.assign"
    ) {
      continue;
    }
    const to = (envelope as { to?: unknown }).to;
    if (typeof to !== "string") {
      continue;
    }
    latestAssignMsByAssignee.set(to, entry.createdAtMs);
  }

  const out = new Set<string>();
  for (const [assignee, assignMs] of latestAssignMsByAssignee) {
    const status = args.statusBySession.get(assignee);
    if (!status) {
      continue;
    }
    if (status.progress === "blocked") {
      continue;
    }
    if (args.nowMs - assignMs <= POSSIBLY_BLOCKED_SILENCE_MS) {
      continue;
    }
    if (status.updatedAt > assignMs) {
      continue;
    }
    out.add(assignee);
  }
  return out;
}
