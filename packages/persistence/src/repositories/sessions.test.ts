import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { migrate } from "../migrate.js";
import {
  createSession,
  getSessionById,
  validateSessionFields,
} from "./sessions.js";

const minimalInput = {
  displayName: "impl",
  runtime: "cursor",
  workspaceLabel: "my-workspace",
};

describe("sessions repository", () => {
  it("disambiguates duplicate display names as impl then impl-1", () => {
    const db = openDatabase(":memory:");
    migrate(db);

    const first = createSession(db, minimalInput);
    const second = createSession(db, minimalInput);

    expect(first.displayName).toBe("impl");
    expect(second.displayName).toBe("impl-1");
    expect(getSessionById(db, first.id)?.isHuman).toBe(false);
  });

  it("persists isHuman when true", () => {
    const db = openDatabase(":memory:");
    migrate(db);
    const { id } = createSession(db, { ...minimalInput, isHuman: true });
    expect(getSessionById(db, id)?.isHuman).toBe(true);
  });

  it("rejects workspaceLabel longer than 256 characters", () => {
    expect(() =>
      validateSessionFields({
        displayName: "a",
        runtime: "b",
        workspaceLabel: "x".repeat(257),
      }),
    ).toThrow(/Invalid session field: workspaceLabel/);
  });
});

describe("SESS-04 file DB reopen", () => {
  const dbPath = join(tmpdir(), `talkie-test-${randomUUID()}.db`);

  afterAll(() => {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it("session row survives new connection after close", () => {
    let db = openDatabase(dbPath);
    migrate(db);
    const { id } = createSession(db, {
      displayName: "persisted",
      runtime: "cursor",
      workspaceLabel: "label",
    });
    db.close();

    db = openDatabase(dbPath);
    migrate(db);
    const row = getSessionById(db, id);
    expect(row).toBeDefined();
    expect(row?.displayName).toBe("persisted");
    db.close();
  });
});
