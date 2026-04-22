# Requirements: agent-talkie

**Defined:** 2026-04-17
**Core Value:** Sessions from different runtimes can collaborate directly through a shared space without the human acting as copy-paste middleware.

## v2.0 Requirements

Requirements for web dashboard milestone. Each maps to roadmap phases.

### Connection & Infrastructure

- [x] **CONN-01**: Dashboard connects to relay via WebSocket with live health indicator
- [x] **CONN-02**: Dashboard auto-reconnects with gap-fill via relaySeq cursor
- [x] **CONN-03**: Relay serves dashboard static assets on same origin in production
- [x] **CONN-04**: User can open dashboard via `talkie dashboard` CLI command

### Monitoring & Oversight

- [x] **OVER-01**: User sees live session roster with runtime, workspace, and role metadata
- [x] **OVER-02**: User sees real-time scrolling transcript timeline with catch-up on connect
- [x] **OVER-03**: User can search and filter transcript by sender, kind, and time window
- [x] **OVER-04**: User sees collaboration metadata at a glance (role, focus, progress, blocked)
- [ ] **OVER-05**: User sees session topology graph showing who is talking to whom *(deferred — not in v2.0 Phase 12; see `.planning/phases/12-discovery-topology-attention/12-CONTEXT.md`)*
- [x] **OVER-06**: User sees blocked/attention lane that surfaces stalled sessions
- [x] **OVER-07**: User sees legible relay errors (no_orchestrator, not_in_space, etc.)

### Interactive Controls

- [x] **CTRL-01**: User can send messages from dashboard (human→orchestrator default, direct targeting)
- [x] **CTRL-02**: User can designate/clear orchestrator from dashboard
- [x] **CTRL-03**: Send is idempotency-aware with safe retries

### Space & Session Management

- [x] **MGMT-01**: User can create and destroy collaboration spaces from dashboard
- [x] **MGMT-02**: User can invite/remove sessions from a space
- [x] **MGMT-03**: User can list and switch between spaces via space picker

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Remote & Security

- **RSEC-01**: Token/TLS/tunnel authentication for non-loopback relay connections
- **RSEC-02**: Invite-based space membership for cross-machine collaboration

### Orchestrator Intelligence

- **ORCH-01**: Proactive orchestrator follow-ups and stalled-thread recovery

### Multi-Space

- **MSPC-01**: Session participates in multiple spaces simultaneously

### Dashboard Extensions

- **DASH-01**: Server-side full-text transcript search (SQLite FTS5)
- **DASH-02**: Desktop notifications for attention-requiring events
- **DASH-03**: Dashboard keyboard shortcuts and CLI-parity layout presets

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-machine/remote dashboard | v2.0 is localhost-only; requires auth story (RSEC-01/02) |
| CRDT collaborative editing | Not an editing tool; message-based collaboration |
| In-dashboard execution/approval | Stay in native client per design principles |
| Socket.io or second protocol | Native WebSocket + canonical envelopes only |
| React/Vue/Svelte dashboard | OpenClaw-aligned: Lit Web Components |
| Unbounded full-history search | Client-side search over loaded window; server FTS deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 7 | Complete |
| CONN-02 | Phase 7 | Complete |
| CONN-03 | Phase 8 | Complete |
| CONN-04 | Phase 8 | Complete |
| OVER-01 | Phase 9 | Complete |
| OVER-02 | Phase 9 | Complete |
| OVER-03 | Phase 12 | Complete |
| OVER-04 | Phase 9 | Complete |
| OVER-05 | *(deferred)* | Pending |
| OVER-06 | Phase 12 | Complete |
| OVER-07 | Phase 9 | Complete |
| CTRL-01 | Phase 10 | Complete |
| CTRL-02 | Phase 10 | Complete |
| CTRL-03 | Phase 10 | Complete |
| MGMT-01 | Phase 11 | Complete |
| MGMT-02 | Phase 11 | Complete |
| MGMT-03 | Phase 11 | Complete |

**Coverage:**
- v2.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 — Phase 8 verification closed CONN-03/04*
