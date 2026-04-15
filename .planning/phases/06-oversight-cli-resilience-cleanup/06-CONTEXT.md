# Phase 6: Oversight CLI resilience & cleanup - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the oversight CLI commands (`talkie who`, `talkie transcript`, `talkie space status`) so they work correctly on a fresh data directory instead of crashing with `SqliteError: no such table`. Remove the unused `@agent-talkie/protocol` dependency from the CLI package. All existing CLI tests must continue to pass.

</domain>

<decisions>
## Implementation Decisions

### Database Initialization Strategy
- **D-01:** Migrate-only approach — oversight commands call `migrate()` from `@agent-talkie/persistence` after `openDatabase()` to ensure table structure exists, without starting the relay daemon. On a fresh data directory with no spaces, commands return "space not found" gracefully instead of crashing.
- **D-02:** The data directory is created if it doesn't exist (e.g., `mkdirSync(dir, { recursive: true })`) before opening the SQLite file. `resolveAgentTalkieDataDir()` only resolves the path — it does not create it.
- **D-03:** `talkie watch` already uses `ensureRelayRunning` and continues to do so (it needs a live relay for WebSocket). The static snapshot commands (`who`, `transcript`, `space status`) use the lighter migrate-only path since they only read the database.

### Dependency Cleanup
- **D-04:** Full cleanup of `@agent-talkie/protocol` from the CLI package: remove from `dependencies` in `package.json`, remove from `externals` in `tsup.config.ts`, and remove the build step from the `pretest` script. No source code imports this package.

### Agent's Discretion
- Exact placement of the `migrate()` call (in `openRelayDatabase` or at each command's call site)
- Whether to add a dedicated test for the fresh-data-directory scenario or extend existing tests
- How to handle the `pretest` script edit (remove just the protocol build step vs restructuring the whole script)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Report
- `.planning/v1.0-MILESTONE-AUDIT.md` — Integration issue #1 (oversight CLI vs uninitialized DB) and tech debt item (unused protocol dep) that define this phase's scope

### Upstream Phase Decisions
- `.planning/phases/05-cross-runtime-proof-human-oversight/05-CONTEXT.md` — D-05 (static snapshot commands), D-06 (live watch split view)
- `.planning/phases/03-supervisor-daemon-lifecycle/03-CONTEXT.md` — D-01 (auto-spawn), D-05 (XDG data dir)

### Existing Code
- `packages/cli/src/oversight/db.ts` — `openRelayDatabase()` — the function that needs the migrate call
- `packages/cli/src/oversight/static-commands.ts` — `runSpaceStatus`, `runTranscriptCommand`, `runWhoCommand` — the commands that crash
- `packages/persistence/src/migrate.ts` — `migrate()` function that creates tables
- `packages/persistence/src/db.ts` — `openDatabase()` function
- `packages/supervisor/src/paths.ts` — `resolveAgentTalkieDataDir()` — resolves but does not create
- `packages/cli/package.json` — has unused `@agent-talkie/protocol` dependency
- `packages/cli/tsup.config.ts` — has `@agent-talkie/protocol` in externals list

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `migrate()` from `@agent-talkie/persistence` — already handles idempotent table creation (checks `schema_version` table, skips applied migrations)
- `resolveAgentTalkieDataDir()` from `@agent-talkie/supervisor` — resolves XDG data directory path
- `openDatabase()` from `@agent-talkie/persistence` — opens SQLite with WAL mode and foreign keys

### Established Patterns
- `openRelayDatabase()` in `packages/cli/src/oversight/db.ts` centralizes database path resolution for all oversight commands — ideal place for adding migrate call
- All oversight commands use try/finally with `db.close()` — consistent resource management
- `talkie watch` already uses `ensureRelayRunning` before WS connect — the pattern for relay-dependent commands exists

### Integration Points
- `packages/cli/src/oversight/db.ts` is imported by both `static-commands.ts` and `watch.ts` — changes here affect all oversight commands
- `packages/persistence` exports `migrate` from its index — CLI already depends on this package

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the fix is straightforward: add migration to the database open path and clean up the unused dependency.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-oversight-cli-resilience-cleanup*
*Context gathered: 2026-04-15*
