import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

function migrationsDir(): string {
  return join(__dirname, "../migrations");
}

function migrationVersion(filename: string): number | null {
  const m = /^(\d+)/.exec(filename);
  return m ? Number.parseInt(m[1], 10) : null;
}

function isMigrationApplied(db: Database.Database, version: number): boolean {
  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get() as { name: string } | undefined;
  if (!table) {
    return false;
  }
  const row = db
    .prepare("SELECT 1 AS ok FROM schema_version WHERE version = ?")
    .get(version) as { ok: number } | undefined;
  return row !== undefined;
}

export function migrate(db: Database.Database): void {
  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const version = migrationVersion(file);
    if (version === null) {
      throw new Error(`Migration file has no numeric prefix: ${file}`);
    }
    if (isMigrationApplied(db, version)) {
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    const appliedAt = new Date().toISOString();
    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
      ).run(version, appliedAt);
    })();
  }
}
