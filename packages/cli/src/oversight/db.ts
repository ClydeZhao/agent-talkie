import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrate } from "@agent-talkie/persistence";
import { resolveAgentTalkieDataDir } from "@agent-talkie/supervisor";

export const RELAY_SQLITE_BASENAME = "relay.sqlite";

export function openRelayDatabase() {
  const dataDir = resolveAgentTalkieDataDir();
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, RELAY_SQLITE_BASENAME));
  migrate(db);
  return db;
}
