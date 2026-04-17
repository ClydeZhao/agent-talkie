# Research synthesis — v2.0 web dashboard (Lit + Vite)

**Synthesized:** 2026-04-17  
**Sources:** `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`

---

## 1. Stack additions

New or extended dependencies for the **browser dashboard** (monorepo unchanged for Node relay, SQLite, Zod 4, Vitest):

| Area | Package / choice | Notes |
|------|------------------|--------|
| UI | `lit` ^3.3.2 | `LitElement`, `lit-html`, decorators; small runtime, shadow DOM, fits streaming WS → UI. |
| Build / dev | `vite` ^8.0.8 | ESM, HMR, TS; dev on separate port with `server.proxy` + **`ws: true`** to relay. |
| Components | `@shoelace-style/shoelace` ^2.20.1 *(or `@material/web` ^2.4.1)* | WC library for forms, dialogs, tables; Shoelace preferred for dense operator UI. |
| Topology | `cytoscape` ^3.33.2 | Graph layout/styling; imperative updates from live events. Avoid heavy cartesian chart stacks for this view. |
| Transcript search | `minisearch` ^7.2.0 *(or `fuse.js` ^7.3.0 — pick one)* | Client index over loaded/batched transcript; not infinite history. |
| Long lists | `@lit-labs/virtualizer` ^2.1.1 | Virtualized transcript / search results. |
| WS client | **Native `WebSocket`** | No Socket.io; same JSON envelopes as relay. |
| Relay (optional) | `serve-static` ^2.2.1 | Serve `dashboard/dist` from existing `http.Server`; ensure upgrades are not swallowed. |
| Testing | Vitest (existing) + **one** of `@web/test-runner` / Playwright for browser; Playwright for E2E smoke. |
| CSS | Lit `static styles` + global tokens on `:root` | Optional Tailwind later; avoid duplicate validation stacks. |

**Explicit non-additions:** Socket.io, uWeb/React for this milestone, Postgres/Redis, second graph library alongside Cytoscape, io-ts/valibot for same envelopes.

---

## 2. Feature table stakes

Must-haves for a credible **primary oversight surface** (replaces CLI for day-to-day ops):

- **Live connection health** — relay up/down, session bound.
- **Member roster** — runtime/session identity aligned with `talkie who` / watch mental model.
- **Ordered transcript timeline** — durable + live tail; catch-up on connect.
- **Find-in-page / search** — at least over loaded window (client index or incremental).
- **Filters** — sender, kind, time window (stable envelope fields in UI model).
- **Collaboration metadata chips** — role, focus, progress, blocked at a glance.
- **Orchestrator visibility** — who gets undirected human traffic.
- **Send message** — to space / target with human→orchestrator default parity.
- **Designate / clear orchestrator** — same control path as CLI.
- **Space lifecycle from UI** — create / destroy consistent with SQLite and active sessions.
- **Invite / remove session** — membership + owner policy.
- **Real-time membership + transcript updates** — push primary; optional debounced DB reconcile.
- **Legible relay errors** — map `protocol.error` (e.g. `no_orchestrator`, `not_in_space`) in UI.

---

## 3. Feature differentiators

Nice-to-haves that fit agent-talkie’s mesh / human-not-paste-buffer story:

- **Session topology / conversation graph** — mesh vs hub; derived from `to` + roles (Cytoscape).
- **“Blocked” and attention lane** — surfaces stalled work without reading everything.
- **Dense operator console** — roster + transcript + graph; keyboard-first search.
- **CLI parity toggles** — watch-equivalent layout presets.
- **Reconnect + gap fill** — tail from last `relaySeq` via `transcript.query` / catch-up.
- **Idempotency-aware UI** — safe retries where protocol requires client keys.

**Stretch within milestone:** topology graph, desktop notifications, richer filters, server-side transcript search (bounded / FTS later).

---

## 4. Architecture decisions

- **New package `@agent-talkie/dashboard`** — Lit + Vite only; depends on `@agent-talkie/protocol` (browser-safe); **no** `persistence` / `better-sqlite3` / Node `ws` in the bundle.
- **Browser session bridge** — Mirror `TalkieSessionClient` handshake → register/resume → join → dispatch; native `WebSocket`; optional future `@agent-talkie/client-web`.
- **Hybrid serving** — **Dev:** Vite on ~5173 with proxy to relay WS/HTTP. **Prod:** prefer **same origin** — extend relay `http.Server` to serve static `dist` (or CLI spawns two processes only if explicitly chosen).
- **One protocol** — Human dashboard is a **human session** on the canonical envelope path; no parallel “dashboard dialect.” Handle **envelopes + server side-channel JSON** (`transcript.catchup`, `collaboration.*`, query results) like post-handshake dispatch today.
- **SQLite access** — Browser **never** opens DB. Reads: WS (`transcript.query`, `metadata.query`) and optionally **HTTP GET** on relay wrapping `oversight.ts` for cold load / space discovery.
- **Live model** — **Subscribe via WebSocket**; do not poll SQLite from browser; optional slow HTTP snapshot fallback only.
- **Ordering** — Single cursor model (`relaySeq` / afterSeq); snapshot then idempotent deltas to avoid split-brain (REST vs push).
- **Lit layering** — Shell/routing → session bridge → roster / transcript / topology / controls; `@lit/task` or small store for async queries.

---

## 5. Watch out for

Priority pitfalls (by severity / frequency in this stack):

| Id | Topic | Mitigation (short) |
|----|--------|-------------------|
| **WD3** | Second SQLite writer from dashboard/API process | Relay sole writer; read-only HTTP inside relay or vetted read-only access — no ad hoc dual-writer. |
| **WD10** | Control actions validated only in UI | Authorize every mutation on relay; log session + human flag. |
| **WD1** | Idle shutdown ignores quiet dashboard tabs | Liveness includes dashboard WS / heartbeat; align with supervisor policy; integration tests. |
| **WD2** | Ambiguous “subscriber” vs full session | Explicit dashboard/human role, narrow capabilities; shared transport, clear state machine. |
| **WD6** | Split-brain after reconnect | Monotonic cursor; catch-up path; don’t merge stale REST over live tail. |
| **WD5** | Fan-out / metadata flooding | Virtualize, debounce/coalesce, caps, optional topic subscriptions. |
| **WD7** | HMR duplicate WS / leaked timers | Singleton connection manager; dispose in `disconnectedCallback`; verify production build. |
| **WD8** | Dev proxy / dual-origin | Document matrix; `ws: true`; production same-origin where possible. |
| **WD9** | Localhost XSS / token exposure | Untrusted transcript as text/sanitized; CSP where feasible; loopback bind; threat model doc. |
| **WD12** | Protocol version skew UI vs relay | `workspace:*`, single Zod version, CI builds both + contract/E2E smoke. |
| **WD14** | Stale generation token after restart | Health / generation check before binding UI; clear cache on mismatch. |
| **WD15** | Unbounded search / `SELECT *` | Pagination, limits, FTS/async path if server search added. |

---

## 6. Build order

Merged ordering from architecture research and dependencies (foundation before vertical slices):

1. **`@agent-talkie/protocol`** — stable; extend Zod only if centralizing side-channel parsing.
2. **Browser session bridge** — handshake, register/resume, join, dispatch loop; unit tests + mock WS or integration.
3. **`@agent-talkie/dashboard` skeleton** — Vite + Lit + one screen: connect, roster (`metadata.query.result`), live tail.
4. **Relay HTTP extensions** — static `dist`; optional GETs for oversight / space list **if** persistence gains list APIs.
5. **Feature slices** — transcript + client search/index; orchestrator controls; invite/remove/destroy; topology.
6. **CLI** — `talkie dashboard` (daemon up, open URL, asset resolution for `npx`).

**MVP credibility checkpoint:** connection state, roster, live transcript + in-window search, metadata chips, send + orchestrator controls, `relaySeq` catch-up.

---

## 7. Open questions

Unresolved items to settle in planning / design:

- **Dashboard WebSocket join semantics** — Dedicated WS path vs human session type on existing server; handshake story (HIGH stack impact, MEDIUM certainty in STACK).
- **Space picker / global listing** — No exported `listSpaces` today; need persistence queries + relay exposure (HTTP vs WS).
- **Topology data contract** — Fully client-derived vs relay **derived events**; layout/perf at scale.
- **Idle / liveness policy** — Exact rules when dashboard is connected but conversation-quiet (supervisor + relay).
- **Filter facets on wire** — Whether relay exposes stable `kind`/type filters beyond client-side parsing.
- **Server-assisted full-text** — When backlog exceeds memory: SQLite FTS5 vs relay-async search (defer vs phase).
- **Static hosting choice locked for releases** — Relay-embedded static + version manifest vs separate host; compatibility checks with relay generation.
- **Browser test runner** — Pick **one** of `@web/test-runner` vs Playwright component tests to avoid runner sprawl.

---

## Sources (aggregated)

- Research files in `.planning/research/` (this milestone).
- `.planning/PROJECT.md` — milestone scope and constraints.
- Repo: `packages/relay/src/server.ts`, `router.ts`, `collaboration-handlers.ts`, `space-lifecycle.ts`; `packages/client/src/session-client.ts`; `packages/persistence/.../oversight.ts`.
- External: Vite server/proxy docs; Lit docs; OpenClaw dashboard PR #23345; SQLite WAL documentation.
