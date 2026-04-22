# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-15
**Phases:** 6 | **Plans:** 20 | **Tasks:** 51

### What Was Built
- Versioned protocol with Zod 4 envelope, JSON Schema export, idempotency, and version negotiation
- SQLite-backed relay with WebSocket routing, space membership, transcript persistence, and collaboration metadata
- Auto-managed daemon lifecycle with supervisor, lockfile, idle shutdown, and CLI (`talkie` commands)
- Shared session client (`@agent-talkie/client`) and stdio adapter with Content-Length framing
- Two runtime adapters (Codex subprocess bridge, Cursor MCP server) proving cross-runtime collaboration
- Live oversight terminal (`talkie watch`) with split-pane participant grid and timeline tail
- Oversight CLI commands (`who`, `transcript`, `space status`) with auto-migration on fresh data dirs

### What Worked
- **Monorepo from day one:** 9 packages with clear boundaries; shared protocol types prevented drift between relay, client, and adapters
- **SQLite as single durable store:** WAL mode handled concurrent adapter access without contention; zero-external-services constraint never felt limiting
- **Test-first plans:** Each plan specified test files and assertions before implementation; Vitest integration tests caught routing and persistence bugs early
- **Phase 6 gap closure:** Milestone audit identified the fresh-data-dir crash; a focused 2-plan phase fixed it cleanly before shipping
- **Adapter-as-edge pattern:** Both adapters (Codex, Cursor MCP) connected through the same client+WebSocket path, validating the architecture

### What Was Inefficient
- **Phase 4 formal verification was delayed:** the first milestone close-out skipped `04-VERIFICATION.md`, and the project had to add it during post-ship stabilization on 2026-04-17
- **Phase 5 human UAT not operator-confirmed:** Automated tests pass (5/5 criteria) but live concurrent adapter runs were never confirmed by a human operator
- **PROJECT.md requirements drift:** Active requirements in PROJECT.md fell behind REQUIREMENTS.md updates during mid-milestone phases; reconciliation needed at completion
- **Plan granularity inconsistent:** Phase 1 had 4 plans for 10 requirements; Phase 5 had 5 plans for 5 requirements. Coarser granularity in early phases worked better for velocity

### Patterns Established
- **Content-Length framing** as the stdio bridge protocol for all adapters (not newline-delimited JSON)
- **Generation tokens** on lockfile for stale-lock detection instead of PID-only checks
- **Space owner model** for multi-human permission semantics without auth infrastructure
- **SQLite-backed CLI reads** (who/transcript/status read the relay DB directly rather than querying via WebSocket)

### Key Lessons
1. **Run milestone audit before shipping.** Phase 6 exists only because the audit caught the fresh-data-dir crash — without it, v1.0 would have shipped broken oversight CLI.
2. **Don't skip VERIFICATION.md.** The time saved by skipping formal verification in Phase 4 was lost to audit noise and manual cross-referencing later.
3. **Coarse granularity works for foundation phases.** Phases 1-3 moved faster with fewer, larger plans. Phase 5 benefited from finer granularity because each adapter was independently testable.
4. **Adapters prove the architecture.** Building two real adapters (not just mocks) exposed assumptions about framing, session lifecycle, and blocked-state surfacing that unit tests wouldn't have caught.

### Cost Observations
- Timeline: 9 days from first commit to shipped milestone
- Commits: 165 total
- Source: ~8,100 LOC TypeScript across 92 files
- All phases executed with quality model profile

---

## Milestone: v2.0 — Web Dashboard

**Shipped:** 2026-04-22
**Phases:** 6 | **Plans:** 18 | **Tasks:** 43

### What Was Built
- Browser WebSocket session bridge with 4-state health machine, exponential backoff reconnect, relaySeq gap-fill dedup, and generation stale detection
- Same-origin dashboard static hosting via relay sirv + `talkie dashboard` CLI entry with `--no-open` and Vitest coverage
- Live roster with runtime/workspace/role metadata, virtualized terminal-style transcript timeline with catch-up/live unification and new-message indicator
- Inline collaboration metadata chips (progress 4-state dots, blocked red frame, blocked-first sorting) and localized relay error bar
- Human send bar with orchestrator-default/direct targeting, orchestrator designate/clear roster menu, and idempotent conversation append with retry
- Space destroy/membership remove handlers with owner+human ACL, space picker with URL `?space=` routing, oversight spaces HTTP endpoint
- Client-side MiniSearch transcript index with AND-mode filters (sender/kind/time), split-pane search panel, and roster Needs Attention lane

### What Worked
- **Bridge+Store+Component layering:** `BrowserSessionBridge` → `DashboardStore` → Lit components gave predictable data flow; debugging was always "check store, then check bridge, then check relay"
- **Same-origin sirv hosting:** Serving dashboard from relay's HTTP listener eliminated CORS issues and simplified deployment to a single `npm run build && talkie dashboard`
- **Idempotent conversation append at relay level:** SQLite-backed `runConversationIdempotentTranscriptAppend` prevented duplicates without client-side dedup logic; replay returns prior wire to sender
- **6-day velocity:** 18 plans across 6 phases in 6 days, with each phase building cleanly on the previous one's exports
- **Scope discipline on OVER-05:** Deferring session topology graph kept Phase 12 focused on high-value search/filter + attention lane

### What Was Inefficient
- **VERIFICATION.md skipped for 5 phases:** Only Phase 8 has a formal verification report. The audit caught this as tech debt but it means no formal evidence trail for phases 7, 9-12
- **MGMT-02 scope mismatch:** REQUIREMENTS.md said "invite/remove" but planning explicitly scoped invite as N/A. The mismatch persisted until milestone completion forced the text fix
- **Roster poll at 10s:** Membership changes aren't fully real-time — new members can lag up to 10 seconds before appearing. Could have used WebSocket membership events instead of HTTP polling
- **Phase 7 completion date missing:** Progress table showed `-` for Phase 7 completion date throughout the milestone; should have been set during phase transition

### Patterns Established
- **New-tab model for space switching:** Each dashboard tab is one space session; picker opens `?space=` in a new tab instead of complex teardown/rebuild
- **MiniSearch for client-side search:** AND-mode filtering over loaded transcript window; `getVisibleTranscriptLines()` as the single source for both transcript display and search results
- **`scrollToDedupeKey` pattern:** Search results and new-message indicators both jump to transcript lines via dedup key, not index
- **Centralized store reactive pattern:** All components read from `DashboardStore`; bridge events are the only writers

### Key Lessons
1. **Write VERIFICATION.md during execution, not after.** Skipping verification on 5 phases created tech debt that the audit surfaced but couldn't fix without manual effort.
2. **Narrow requirement text when scope changes.** MGMT-02 invite was decided N/A during planning but the requirement text wasn't updated until forced at milestone close. Keep REQUIREMENTS.md in sync with planning decisions.
3. **Same-origin serving simplifies everything.** Dashboard-from-relay eliminates CORS, reduces ports, and makes `talkie dashboard` a single-command experience.
4. **Client-side search is good enough for loaded history.** MiniSearch with AND filters covers the primary use case; server-side FTS5 can wait until users report scaling issues.

### Cost Observations
- Timeline: 6 days (2026-04-17 → 2026-04-22)
- Commits: ~67 touching dashboard/relay/cli packages
- Source: ~11,850 LOC TypeScript in v2.0 packages (~16,900 total project)
- New package: `@agent-talkie/dashboard` (Lit 3 + Vite 8)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 20 | Foundation milestone; established monorepo, protocol, relay, adapters, oversight |
| v2.0 | 6 | 18 | Web dashboard; bridge+store+component layering; same-origin serving; client-side search |

### Cumulative Quality

| Milestone | Commits | LOC (TS) | Packages |
|-----------|---------|----------|----------|
| v1.0 | 165 | ~8,100 | 9 |
| v2.0 | ~67 | ~16,900 | 10 |

### Top Lessons (Verified Across Milestones)

1. Run milestone audit before marking complete — it catches integration gaps that phase-level verification misses (v1.0: Phase 6 gap-closure; v2.0: MGMT-02 scope mismatch)
2. Don't skip formal verification — the time saved is always lost to downstream audit work (v1.0: Phase 4 delayed; v2.0: 5 phases skipped entirely)
3. Keep requirement text in sync with planning decisions — scope changes during planning must update REQUIREMENTS.md immediately, not at milestone close
