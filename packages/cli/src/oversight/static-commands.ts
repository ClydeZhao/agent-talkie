import {
  getOversightSpaceSummaryBySlug,
  listOversightTranscriptTailBySlug,
} from "@agent-talkie/persistence";
import { openRelayDatabase } from "./db.js";

export async function runSpaceStatus(slug: string): Promise<void> {
  const db = openRelayDatabase();
  try {
    const summary = getOversightSpaceSummaryBySlug(db, slug);
    if (!summary) {
      console.error(`space not found: ${slug}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
}

export async function runTranscriptCommand(
  slug: string,
  limit: number,
): Promise<void> {
  const db = openRelayDatabase();
  try {
    const rows = listOversightTranscriptTailBySlug(db, { slug, limit });
    if (rows.length === 0) {
      const probe = getOversightSpaceSummaryBySlug(db, slug);
      if (!probe) {
        console.error(`space not found: ${slug}`);
        process.exitCode = 1;
        return;
      }
    }
    const payload = rows.map((row) => {
      let envelope: unknown;
      try {
        envelope = JSON.parse(row.envelopeJson);
      } catch {
        envelope = { _invalidJson: true as const };
      }
      return { relaySeq: row.relaySeq, envelope };
    });
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    db.close();
  }
}

export async function runWhoCommand(slug: string): Promise<void> {
  const db = openRelayDatabase();
  try {
    const summary = getOversightSpaceSummaryBySlug(db, slug);
    if (!summary) {
      console.error(`space not found: ${slug}`);
      process.exitCode = 1;
      return;
    }
    const header = "session_id\tdisplay_name\tis_human\trole\tprogress";
    console.log(header);
    for (const m of summary.members) {
      const line = [
        m.sessionId,
        m.displayName,
        m.isHuman ? "true" : "false",
        m.role,
        m.progress,
      ].join("\t");
      console.log(line);
    }
  } finally {
    db.close();
  }
}
