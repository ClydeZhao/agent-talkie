---
phase: 05-cross-runtime-proof-human-oversight
plan: "03"
subsystem: testing
tags: [mcp, sqlite, websocket, zod, vitest]

requires:
  - phase: "05-01"
    provides: Relay, collaboration handlers, migrations used by oversight queries
  - phase: "05-02"
    provides: Codex adapter patterns and env conventions referenced in UAT doc

provides:
  - SQL oversight read helpers in persistence
  - "@agent-talkie/adapter-cursor-mcp" MCP stdio server (SDK ^1.29.0)
  - Automated two-runtime relay protocol test
  - Human concurrent-adapter checklist (05-CONCURRENT-PROOF.md)

affects:
  - Phase 5 verification and Cursor MCP host configuration

tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.29.0"]
  patterns:
    - "Explicit URI resources for transcript/metadata (pull model, default timeline cap 50)"
    - "Tool args: SDK z.any() then Zod + protocol schema for consistent validation_error text"

key-files:
  created:
    - packages/persistence/src/repositories/oversight.ts
    - packages/persistence/src/repositories/oversight.test.ts
    - packages/adapter-cursor-mcp/package.json
    - packages/adapter-cursor-mcp/src/mcp-server.ts
    - packages/adapter-cursor-mcp/src/mcp-server.test.ts
    - packages/adapter-cursor-mcp/src/index.ts
    - packages/relay/src/__tests__/phase5-concurrent-adapters.test.ts
    - .planning/phases/05-cross-runtime-proof-human-oversight/05-CONCURRENT-PROOF.md
  modified:
    - packages/persistence/src/index.ts
    - package.json
    - package-lock.json

key-decisions:
  - "registerTool uses inputSchema z.any() so handler-owned Zod can return validation_error substrings on all tool failures"
  - "Resource reads use ReadResourceResult contents (uri + text); missing relay.sqlite returns plain-text explanation"

requirements-completed: [ADAPT-02, OVER-02, OVER-03]

duration: 25 min
completed: 2026-04-14
---

# Phase 05 Plan 03: MCP adapter & oversight reads Summary

**MCP stdio server (`talkie-cursor-mcp`) on SDK ^1.29.0 with four named tools and `talkie://space/{slug}/…` resources backed by new SQLite oversight helpers; relay integration test proves two runtimes in one space.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-14T10:47:00Z (approx.)
- **Completed:** 2026-04-14T10:57:00Z (approx.)
- **Tasks:** 3
- **Files touched:** 13 tracked paths (excludes build artifacts)

## Accomplishments

- Read-only oversight repository: space summary, transcript tail, blocked sessions
- New workspace package wiring relay WS + persistence reads for MCP resources
- Automated protocol-level concurrent session proof plus operator checklist for real installs

## Task Commits

1. **Task 1: Oversight repository (TDD)** — `44195c0` test(05-03): failing tests; `b8ea6e5` feat(05-03): oversight implementation
2. **Task 2: MCP adapter (TDD)** — `b9dcf81` test(05-03): package + registration test; `9ab2da4` feat(05-03): full MCP server
3. **Task 3: Concurrent proof** — `c4090bb` feat(05-03): relay test + UAT checklist updates

**Plan metadata:** docs(05-03) commit on branch (SUMMARY + MCP test mock typing)

## Files Created/Modified

- `packages/persistence/src/repositories/oversight.ts` — `getOversightSpaceSummaryBySlug`, transcript tail, blocked list
- `packages/persistence/src/repositories/oversight.test.ts` — fixture-backed behavior tests
- `packages/persistence/src/index.ts` — re-exports oversight API
- `packages/adapter-cursor-mcp/*` — MCP server, bin `talkie-cursor-mcp`, Vitest registration test
- `package.json` / `package-lock.json` — workspace + root build/test scripts
- `packages/relay/src/__tests__/phase5-concurrent-adapters.test.ts` — two runtimes, one `chat.message` round-trip
- `.planning/.../05-CONCURRENT-PROOF.md` — six-step human checklist with Pass/Fail fields

## Decisions Made

- Tool-level validation returns `validation_error:` prefixed text in `CallToolResult` for predictable operator and host behavior, rather than relying on SDK default InvalidParams wording alone (SDK still validates `z.any()` only).

## Deviations from Plan

None - plan executed as written. Minor clarification: `registerTool` uses `z.any()` as `inputSchema` so every tool path can emit the required `validation_error` substring from handler validation.

## Issues Encountered

None.

## User Setup Required

Cursor (or another MCP host) must point stdio at `talkie-cursor-mcp` per plan `user_setup` — see plan frontmatter and `05-CONCURRENT-PROOF.md` for env vars (`TALKIE_MCP_*`, `TALKIE_CODEX_*`).

## Next Phase Readiness

Ready for orchestrator to refresh **STATE.md** / **ROADMAP.md** and mark requirements **ADAPT-02**, **OVER-02**, **OVER-03** in **REQUIREMENTS.md** when the wave completes.

## Self-Check: PASSED

- Confirmed paths: `oversight.ts`, `mcp-server.ts`, `phase5-concurrent-adapters.test.ts`, `05-CONCURRENT-PROOF.md`, `05-03-SUMMARY.md` exist on disk
- Task commits `44195c0`, `b8ea6e5`, `b9dcf81`, `9ab2da4`, `c4090bb` present on branch; docs/SUMMARY commit follows on same branch

---
*Phase: 05-cross-runtime-proof-human-oversight*  
*Completed: 2026-04-14*
