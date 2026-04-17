# Requirements: agent-talkie

**Defined:** 2026-04-17
**Core Value:** Sessions from different runtimes can collaborate directly through a shared space without the human acting as copy-paste middleware.

## v2.0 Requirements

Requirements for web dashboard milestone. Each maps to roadmap phases.

### Connection & Infrastructure

- [x] **CONN-01**: Dashboard connects to relay via WebSocket with live health indicator
- [x] **CONN-02**: Dashboard auto-reconnects with gap-fill via relaySeq cursor
- [ ] **CONN-03**: Relay serves dashboard static assets on same origin in production
- [ ] **CONN-04**: User can open dashboard via `talkie dashboard` CLI command

### Monitoring & Oversight

- [ ] **OVER-01**: User sees live session roster with runtime, workspace, and role metadata
- [ ] **OVER-02**: User sees real-time scrolling transcript timeline with catch-up on connect
- [ ] **OVER-03**: User can search and filter transcript by sender, kind, and time window
- [ ] **OVER-04**: User sees collaboration metadata at a glance (role, focus, progress, blocked)
- [ ] **OVER-05**: User sees session topology graph showing who is talking to whom
- [ ] **OVER-06**: User sees blocked/attention lane that surfaces stalled sessions
- [ ] **OVER-07**: User sees legible relay errors (no_orchestrator, not_in_space, etc.)

### Interactive Controls

- [ ] **CTRL-01**: User can send messages from dashboard (human→orchestrator default, direct targeting)
- [ ] **CTRL-02**: User can designate/clear orchestrator from dashboard
- [ ] **CTRL-03**: Send is idempotency-aware with safe retries

### Space & Session Management

- [ ] **MGMT-01**: User can create and destroy collaboration spaces from dashboard
- [ ] **MGMT-02**: User can invite/remove sessions from a space
- [ ] **MGMT-03**: User can list and switch between spaces via space picker

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
| CONN-03 | Phase 8 | Pending |
| CONN-04 | Phase 8 | Pending |
| OVER-01 | Phase 9 | Pending |
| OVER-02 | Phase 9 | Pending |
| OVER-03 | Phase 12 | Pending |
| OVER-04 | Phase 9 | Pending |
| OVER-05 | Phase 12 | Pending |
| OVER-06 | Phase 12 | Pending |
| OVER-07 | Phase 9 | Pending |
| CTRL-01 | Phase 10 | Pending |
| CTRL-02 | Phase 10 | Pending |
| CTRL-03 | Phase 10 | Pending |
| MGMT-01 | Phase 11 | Pending |
| MGMT-02 | Phase 11 | Pending |
| MGMT-03 | Phase 11 | Pending |

**Coverage:**
- v2.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 — v2.0 roadmap traceability (phases 7–12)*
