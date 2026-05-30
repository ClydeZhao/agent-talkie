import { readdirSync, rmSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nodeModulesRoot = join(packageRoot, "node_modules");

rmSync(join(nodeModulesRoot, "@agent-talkie"), {
  recursive: true,
  force: true,
});

try {
  if (readdirSync(nodeModulesRoot).length === 0) {
    rmdirSync(nodeModulesRoot);
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}
