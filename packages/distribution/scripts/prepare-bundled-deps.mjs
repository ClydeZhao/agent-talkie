import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(packageRoot, "../..");
const scopeRoot = join(packageRoot, "node_modules", "@agent-talkie");

const bundledPackages = [
  "adapter-cursor-mcp",
  "cli",
  "client",
  "dashboard",
  "persistence",
  "protocol",
  "relay",
  "supervisor",
];

function runRootBuild() {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Cannot bundle agent-talkie: root build failed with ${result.status}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function copyPackage(packageName) {
  const sourceRoot = join(repoRoot, "packages", packageName);
  const manifestPath = join(sourceRoot, "package.json");
  const manifest = readJson(manifestPath);
  const targetRoot = join(scopeRoot, packageName);

  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  copyFileSync(manifestPath, join(targetRoot, "package.json"));

  const packageFiles = manifest.files ?? ["dist"];
  for (const entry of packageFiles) {
    const source = join(sourceRoot, entry);
    if (!existsSync(source)) {
      throw new Error(
        `Cannot bundle @agent-talkie/${packageName}: missing ${entry}. Run the package build first.`,
      );
    }
    cpSync(source, join(targetRoot, entry), {
      recursive: true,
      dereference: true,
      preserveTimestamps: true,
    });
  }
}

runRootBuild();

rmSync(scopeRoot, { recursive: true, force: true });
mkdirSync(scopeRoot, { recursive: true });

for (const packageName of bundledPackages) {
  copyPackage(packageName);
}
