import type Database from "better-sqlite3";
import type { WebSocket } from "ws";
import { listTranscriptTailBySeq } from "@agent-talkie/persistence";

export const CATCH_UP_DEFAULT_LIMIT = 100;

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export async function sendTranscriptCatchUp(opts: {
  db: Database.Database;
  ws: WebSocket;
  spaceId: string;
}): Promise<void> {
  const rows = listTranscriptTailBySeq(opts.db, {
    spaceId: opts.spaceId,
    limit: CATCH_UP_DEFAULT_LIMIT,
  });
  for (const row of rows) {
    let envelope: unknown;
    try {
      envelope = JSON.parse(row.envelopeJson) as unknown;
    } catch {
      continue;
    }
    sendJson(opts.ws, {
      type: "transcript.catchup",
      spaceId: opts.spaceId,
      relaySeq: row.relaySeq,
      envelope,
    });
  }
}
