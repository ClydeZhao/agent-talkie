---
phase: 1
slug: protocol-transport-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/protocol/vitest.config.ts (Wave 0 installs) |
| **Quick run command** | `pnpm --filter @agent-talkie/protocol test` |
| **Full suite command** | `pnpm --filter @agent-talkie/protocol test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agent-talkie/protocol test`
- **After every plan wave:** Run `pnpm --filter @agent-talkie/protocol test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PROTO-01 | — | Envelope validates with all required fields | unit | `pnpm --filter @agent-talkie/protocol test` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | PROTO-02 | — | Idempotency guard rejects duplicates | unit | `pnpm --filter @agent-talkie/protocol test` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | PROTO-04 | — | Unknown schema version rejected with error | unit | `pnpm --filter @agent-talkie/protocol test` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | PROTO-03 | — | Control and conversation subjects are distinct | unit | `pnpm --filter @agent-talkie/protocol test` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PROTO-02 | — | JetStream deduplicates by msgID | integration | `pnpm --filter @agent-talkie/protocol test:jetstream` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/protocol/vitest.config.ts` — vitest configuration
- [ ] `packages/protocol/src/__tests__/envelope.test.ts` — stubs for PROTO-01, PROTO-02, PROTO-04
- [ ] `packages/protocol/src/__tests__/subjects.test.ts` — stubs for PROTO-03

*Covered by Plan 01-01 Task 1 (scaffold) and Plan 01-02 Task 2.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
