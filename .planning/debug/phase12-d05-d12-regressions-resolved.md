# Debug Session: Phase 12 D-05/D-12 Regressions

**Status:** RESOLVED
**Phase:** 12-discovery-topology-attention
**Date:** 2026-04-22

## Issues

### Issue 1: blockedReason not visible in Needs Attention (D-12)
- **Expected:** Attention lane entries show session name, blocked reason, and urgency indicator
- **Actual:** blockedReason only set as `title` attribute (tooltip), never rendered as visible text
- **Root cause:** `talkie-roster-entry.ts` used `blockedReason` only in `title=${titleAttr}` — no visible DOM element
- **Fix:** Added `.blocked-reason` div rendering `r.blockedReason` when `progress==="blocked" && blockedReason.length > 0`
- **File:** `packages/dashboard/src/roster/talkie-roster-entry.ts`

### Issue 2: No search result highlighting (D-05)
- **Expected:** Search results show highlighted matches via `<mark>` elements
- **Actual:** Results rendered as plain text — no highlighting logic
- **Root cause:** `talkie-search-panel.ts` used `${this._payloadSummary(line)}` as plain text without any term wrapping
- **Fix:** Created `highlightText(text, query)` in `search/highlight-text.ts`. Tokenizes query, wraps matches in `<mark class="search-hit">`. Applied to sender, type, and payload in result rendering.
- **Files:** `packages/dashboard/src/search/highlight-text.ts` (new), `packages/dashboard/src/shell/talkie-search-panel.ts`

## Tests Added

- `packages/dashboard/src/roster/talkie-roster-entry.test.ts` — 3 tests
- `packages/dashboard/src/search/highlight-text.test.ts` — 7 tests (via `lit` render to DOM)

## Verification

- All 46 dashboard tests pass (10 files)
- Production build succeeds (163 modules)
- Prior 47 relay tests unaffected
