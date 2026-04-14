# Phase 5: Concurrent two-adapter proof (human UAT)

Companion to **ROADMAP** Phase 5 success criterion #1: two distinct runtime adapters connected **concurrently**, collaborating through the relay.

**Automated coverage:** `packages/relay/src/__tests__/phase5-concurrent-adapters.test.ts` (Plan 05-03 Task 3).

## Preconditions

1. Relay running on localhost (`talkie relay ensure` or equivalent).
2. Same `AGENT_TALKIE_DATA_DIR` (or default) for relay, `talkie-codex-adapter`, and `talkie-cursor-mcp`.
3. Space slug `S` agreed for the run (e.g. `phase5-concurrent`).

## Checklist

1. Start relay; confirm `talkie relay status` (or health) shows listening. **Pass / Fail:** ______ **Notes:** ______
2. Start **adapter-codex** (`talkie-codex-adapter` / `npm exec`) with env so it joins slug `S` (`TALKIE_CODEX_JOIN_SLUG=S` or `TALKIE_CODEX_SPACE_ID` after join). Runtime should register as **adapter-codex**. **Pass / Fail:** ______ **Notes:** ______
3. Start **adapter-cursor-mcp** (`talkie-cursor-mcp`) with Cursor or MCP inspector; call tool `join_space` with `{ "slug": "<S>" }` using the same slug as step 2. Runtime should register as **adapter-cursor-mcp**. **Pass / Fail:** ______ **Notes:** ______
4. Run `talkie who --slug S` — stdout lists **two** distinct sessions whose runtimes (or display names) identify Codex vs MCP paths. **Pass / Fail:** ______ **Notes:** ______
5. From one adapter, send a collaboration-visible action (e.g. `chat.message` or a metadata update); confirm the other side receives it or SQLite transcript shows the envelope within a reasonable window. **Pass / Fail:** ______ **Notes:** ______
6. Leave both adapters running ≥60s — no unexpected disconnect; relay logs clean of repeated protocol errors. **Pass / Fail:** ______ **Notes:** ______

**Overall pass:** Steps 1–4 succeed; step 5 shows cross-adapter visibility; step 6 stable.

**Record:** Date, commit, and note any env overrides (`TALKIE_CODEX_*`, `TALKIE_MCP_*`).
