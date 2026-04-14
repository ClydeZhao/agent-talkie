import { join } from "node:path";
import { openDatabase } from "@agent-talkie/persistence";
import { resolveAgentTalkieDataDir } from "@agent-talkie/supervisor";

export const RELAY_SQLITE_BASENAME = "relay.sqlite";

export function openRelayDatabase() {
  return openDatabase(
    join(resolveAgentTalkieDataDir(), RELAY_SQLITE_BASENAME),
  );
}
