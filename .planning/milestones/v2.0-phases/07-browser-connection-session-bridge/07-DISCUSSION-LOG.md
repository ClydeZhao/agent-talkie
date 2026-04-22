# Phase 7: Browser connection & session bridge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 07-browser-connection-session-bridge
**Areas discussed:** Browser client architecture, Connection health UX, Reconnect strategy, Session identity persistence

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Browser client architecture | New package vs reuse Node client; protocol sharing approach | ✓ |
| Connection health UX | States, visual indicators, generation mismatch handling | ✓ |
| Reconnect strategy | Backoff, retry limits, relaySeq cursor, split-brain avoidance | ✓ |
| Session identity persistence | localStorage vs sessionStorage vs in-memory; cross-tab behavior | ✓ |

**User's choice:** "你来决定吧" — user deferred all area selection and decisions to agent discretion.

---

## Browser Client Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Extend TalkieSessionClient | Wrap or subclass existing Node.js client with browser shim | |
| New browser-native bridge | Standalone class using native WebSocket, sharing protocol schemas only | ✓ |
| Isomorphic client | Single client that works in both Node.js and browser via conditional imports | |

**User's choice:** Agent discretion — selected "New browser-native bridge"
**Notes:** TalkieSessionClient is deeply coupled to `ws` library patterns (event listeners, RawData types). Browser WebSocket API is different enough that a clean implementation sharing only protocol schemas is more maintainable. Isomorphic approach adds complexity without clear benefit for this project.

---

## Connection Health UX

| Option | Description | Selected |
|--------|-------------|----------|
| Color dot + text label | Green/amber/red dot with adjacent text (connected/connecting/etc.) | ✓ |
| Toast notifications | Transient pop-up notifications on state changes | |
| Status bar text only | Plain text status without visual indicator | |

**User's choice:** Agent discretion — selected "Color dot + text label"
**Notes:** Color dot provides at-a-glance visibility. Toast notifications would be noisy for frequent reconnect cycles. Generation mismatch gets a separate non-dismissible banner rather than a toast.

---

## Reconnect Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff, capped, unlimited retries | 1s→2s→4s→8s→...→30s cap, never give up | ✓ |
| Fixed interval retry | Retry every N seconds, cap at M attempts | |
| Linear backoff with max retries | Increase delay linearly, stop after N failures | |

**User's choice:** Agent discretion — selected "Exponential backoff, capped, unlimited retries"
**Notes:** Localhost relay should always be recoverable (relay restarts, OS sleep/wake). No reason to permanently give up. Exponential backoff prevents tight-loop polling during extended outages.

---

## Session Identity Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| sessionStorage (tab-scoped) | Survives page refresh within same tab, new tab = new session | ✓ |
| localStorage (cross-tab) | Survives refresh and new tabs, shared identity across tabs | |
| In-memory only | Lost on any page refresh, simplest but worst UX | |

**User's choice:** Agent discretion — selected "sessionStorage (tab-scoped)"
**Notes:** Tab-scoped persistence is the simplest correct choice. Cross-tab sharing via localStorage would require coordination logic (which tab "owns" the WS connection?) that adds complexity without clear v2.0 need. In-memory only would cause unnecessary re-registration on every refresh.

---

## Agent's Discretion

- Backoff jitter implementation
- Internal reactive state management pattern (Lit controllers vs custom events vs signals)
- WebSocket mock approach for tests

## Deferred Ideas

None — discussion stayed within phase scope.
