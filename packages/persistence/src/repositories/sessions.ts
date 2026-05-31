import type Database from "better-sqlite3";
import { v7 as uuidv7 } from "uuid";

const MAX_DISPLAY_NAME = 128;
const MAX_RUNTIME = 64;
const MAX_WORKSPACE_LABEL = 256;
const MAX_BRANCH = 128;
const MAX_FOCUS = 512;

export type SessionInboxMode = "live" | "pull";

export type NewSessionInput = {
  displayName: string;
  runtime: string;
  workspaceLabel: string;
  branch?: string;
  focus?: string;
  inboxMode?: SessionInboxMode;
  /** Omitted or false → stored as non-human (0). */
  isHuman?: boolean;
};

export function disambiguateDisplayName(
  preferred: string,
  existingDisplayNames: readonly string[],
): string {
  const set = new Set(existingDisplayNames);
  if (!set.has(preferred)) {
    return preferred;
  }
  for (let n = 1; ; n += 1) {
    const candidate = `${preferred}-${n}`;
    if (!set.has(candidate)) {
      return candidate;
    }
  }
}

export function validateSessionFields(input: NewSessionInput): void {
  const displayName = input.displayName.trim();
  const runtime = input.runtime.trim();
  const workspaceLabel = input.workspaceLabel.trim();
  const branch = input.branch?.trim() ?? "";
  const focus = input.focus?.trim() ?? "";

  if (!displayName) {
    throw new Error("Invalid session field: displayName is empty after trim");
  }
  if (displayName.length > MAX_DISPLAY_NAME) {
    throw new Error(
      "Invalid session field: displayName exceeds maximum length (128)",
    );
  }
  if (!runtime) {
    throw new Error("Invalid session field: runtime is empty after trim");
  }
  if (runtime.length > MAX_RUNTIME) {
    throw new Error("Invalid session field: runtime exceeds maximum length (64)");
  }
  if (!workspaceLabel) {
    throw new Error("Invalid session field: workspaceLabel is empty after trim");
  }
  if (workspaceLabel.length > MAX_WORKSPACE_LABEL) {
    throw new Error(
      "Invalid session field: workspaceLabel exceeds maximum length (256)",
    );
  }
  if (input.branch !== undefined && branch.length > MAX_BRANCH) {
    throw new Error("Invalid session field: branch exceeds maximum length (128)");
  }
  if (input.focus !== undefined && focus.length > MAX_FOCUS) {
    throw new Error("Invalid session field: focus exceeds maximum length (512)");
  }
  if (
    input.inboxMode !== undefined &&
    input.inboxMode !== "live" &&
    input.inboxMode !== "pull"
  ) {
    throw new Error("Invalid session field: inboxMode must be live or pull");
  }
}

export function createSession(
  db: Database.Database,
  input: NewSessionInput,
  opts?: {
    id?: string;
    displayNameResolver?: (base: string) => string;
  },
): { id: string; displayName: string } {
  validateSessionFields(input);
  const id = opts?.id ?? uuidv7();
  const rows = db
    .prepare("SELECT display_name FROM sessions")
    .all() as { display_name: string }[];
  const existing = rows.map((r) => r.display_name);
  const base = input.displayName.trim();
  const resolve =
    opts?.displayNameResolver ??
    ((b: string) => disambiguateDisplayName(b, existing));
  const displayName = resolve(base);
  const now = Date.now();
  const branch = input.branch?.trim() || null;
  const focus = input.focus?.trim() || null;
  const inboxMode = input.inboxMode ?? "live";
  const isHuman = input.isHuman === true ? 1 : 0;

  db.prepare(
    `INSERT INTO sessions (id, display_name, runtime, workspace_label, branch, focus, inbox_mode, created_at, updated_at, is_human)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    displayName,
    input.runtime.trim(),
    input.workspaceLabel.trim(),
    branch,
    focus,
    inboxMode,
    now,
    now,
    isHuman,
  );

  return { id, displayName };
}

export function getSessionById(
  db: Database.Database,
  id: string,
):
  | {
      id: string;
      displayName: string;
      runtime: string;
      workspaceLabel: string;
      branch: string | null;
      focus: string | null;
      inboxMode: SessionInboxMode;
      isHuman: boolean;
      createdAt: number;
      updatedAt: number;
    }
  | undefined {
  const row = db
    .prepare(
      `SELECT id, display_name, runtime, workspace_label, branch, focus, inbox_mode, is_human, created_at, updated_at
       FROM sessions WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        display_name: string;
        runtime: string;
        workspace_label: string;
        branch: string | null;
        focus: string | null;
        inbox_mode: SessionInboxMode;
        is_human: number;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    runtime: row.runtime,
    workspaceLabel: row.workspace_label,
    branch: row.branch,
    focus: row.focus,
    inboxMode: row.inbox_mode,
    isHuman: row.is_human === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
