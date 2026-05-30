import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { migrate } from "./migrate.js";

describe("migrate", () => {
  it("applies migrations idempotently", () => {
    const db = openDatabase(":memory:");
    migrate(db);

    const sessionsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'",
      )
      .get() as { name: string } | undefined;
    expect(sessionsTable?.name).toBe("sessions");

    const v1 = db
      .prepare("SELECT version, applied_at FROM schema_version WHERE version = ?")
      .get(1) as { version: number; applied_at: string } | undefined;
    expect(v1?.version).toBe(1);
    expect(typeof v1?.applied_at).toBe("string");

    migrate(db);

    const count = db
      .prepare(
        "SELECT COUNT(*) AS n FROM schema_version WHERE version = 1",
      )
      .get() as { n: number };
    expect(count.n).toBe(1);
  });
});
