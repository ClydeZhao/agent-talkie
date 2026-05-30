import { randomUUID } from "node:crypto";
import { TalkieSessionClient } from "@agent-talkie/client";
import {
  getCollaborationMetadataSnapshot,
  getOversightSpaceSummaryBySlug,
  listOversightTranscriptTailBySlug,
} from "@agent-talkie/persistence";
import { ensureRelayRunning } from "@agent-talkie/supervisor";
import { openRelayDatabase } from "./db.js";
import { formatPossiblyBlockedLabel } from "./format.js";
import { inferPossiblyBlockedSessionIds } from "./possibly-blocked.js";

// OVER-03: timeline shown here is not injected into agent sessions.

const PARTICIPANT_PANE_ROWS = 8;

function timelineTypeFromRow(envelopeJson: string): string {
  try {
    const env = JSON.parse(envelopeJson) as { type?: string; kind?: string };
    return env.type ?? env.kind ?? "";
  } catch {
    return "";
  }
}

export async function runWatch(opts: {
  slug: string;
  refreshMs?: number;
}): Promise<void> {
  const refreshMs = opts.refreshMs ?? 1000;
  const { port } = await ensureRelayRunning({});
  const client = new TalkieSessionClient({
    url: `ws://127.0.0.1:${port}`,
  });
  await client.connect();
  await client.registerSession({
    displayName: process.env.TALKIE_WATCH_DISPLAY_NAME ?? "human-watch",
    runtime: process.env.TALKIE_WATCH_RUNTIME ?? "cli-watch",
    workspaceLabel: process.env.TALKIE_WATCH_WORKSPACE_LABEL ?? ".",
    isHuman: true,
  });
  await client.joinSpace({
    slug: opts.slug,
    idempotencyKey: randomUUID(),
  });

  let dirty = false;
  client.onEnvelope(() => {
    dirty = true;
  });

  const redraw = (): void => {
    if (dirty) {
      dirty = false;
    }
    const totalRows = process.stdout.rows ?? 24;
    const db = openRelayDatabase();
    try {
      const summary = getOversightSpaceSummaryBySlug(db, opts.slug);
      const tail = listOversightTranscriptTailBySlug(db, {
        slug: opts.slug,
        limit: 500,
      });

      const statusBySession = new Map<
        string,
        { progress: string; updatedAt: number }
      >();
      if (summary) {
        const snap = getCollaborationMetadataSnapshot(db, summary.spaceId);
        for (const s of snap.sessions) {
          statusBySession.set(s.sessionId, {
            progress: s.status.progress,
            updatedAt: s.status.updatedAt,
          });
        }
      }

      const inferred = inferPossiblyBlockedSessionIds({
        transcriptEntries: tail,
        statusBySession,
        nowMs: Date.now(),
      });

      const lines: string[] = [];
      lines.push("PARTICIPANTS");
      lines.push("session\trole\tfocus\tprogress\tattention");
      if (summary) {
        for (const m of summary.members.slice(0, 6)) {
          const attention = formatPossiblyBlockedLabel(
            m.progress === "blocked",
            inferred.has(m.sessionId),
          );
          lines.push(
            [m.sessionId, m.role, m.focus, m.progress, attention].join("\t"),
          );
        }
      }
      while (lines.length < PARTICIPANT_PANE_ROWS) {
        lines.push("");
      }

      const remainingForTimeline = totalRows - lines.length;
      if (remainingForTimeline > 0) {
        lines.push("TIMELINE");
        const slotsForEntries = totalRows - lines.length;
        const timelineCount = Math.min(20, Math.max(0, slotsForEntries));
        const slice = tail.slice(-timelineCount);
        for (const row of slice) {
          lines.push(`${row.relaySeq}\t${timelineTypeFromRow(row.envelopeJson)}`);
        }
      }

      while (lines.length < totalRows) {
        lines.push("");
      }
      const frame = lines.slice(0, totalRows).join("\n");
      process.stdout.write(`\x1b[2J\x1b[H${frame}\n`);
    } finally {
      db.close();
    }
  };

  const timer = setInterval(redraw, refreshMs);
  redraw();

  await new Promise<void>((resolve) => {
    const onSigInt = () => {
      clearInterval(timer);
      client.close();
      process.off("SIGINT", onSigInt);
      resolve();
    };
    process.on("SIGINT", onSigInt);
  });
}
