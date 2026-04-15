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
- **Phase 4 skipped formal verification:** 10 requirements lack VERIFICATION.md — code and tests exist but the formal process was skipped, creating audit noise
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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 20 | Foundation milestone; established monorepo, protocol, relay, adapters, oversight |

### Cumulative Quality

| Milestone | Commits | LOC (TS) | Packages |
|-----------|---------|----------|----------|
| v1.0 | 165 | ~8,100 | 9 |

### Top Lessons (Verified Across Milestones)

1. Run milestone audit before marking complete — it catches integration gaps that phase-level verification misses
2. Don't skip formal verification — the time saved is always lost to downstream audit work
