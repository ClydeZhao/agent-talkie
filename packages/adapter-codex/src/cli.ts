import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCodexAdapter } from "./codex-bridge.js";

function isMainModule(): boolean {
  const entry = fileURLToPath(import.meta.url);
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return resolve(argv1) === resolve(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runCodexAdapter().catch(() => {
    process.exitCode = 1;
  });
}
