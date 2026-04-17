# Pitfalls — Adding a Real-Time Web Dashboard (v2.0)

**Product:** agent-talkie — WebSocket relay, SQLite (WAL), supervisor-managed daemon, `@agent-talkie/client` for native sessions, CLI reads SQLite for oversight.

**Researched:** 2026-04-17

**Scope:** Mistakes common when **adding** a localhost-scoped, Lit/Vite-style web dashboard on top of an **existing** relay + SQLite system — connection lifecycle, concurrency, UI stack, update rates, security, sync, dev UX, monorepo packaging. Not a repeat of generic distributed-systems advice.

**Confidence:** MEDIUM–HIGH for SQLite single-writer + WAL patterns and WebSocket-per-connection ordering (well-documented). MEDIUM for Lit-specific footguns (verify against current Lit docs in implementation). Phase names are **thematic** until `.planning/ROADMAP.md` assigns numeric phases.

**Related:** Earlier cross-cutting pitfalls (relay host identity, idle shutdown races, orphan processes, protocol ordering) remain valid; see [Historical — cross-cutting collaboration pitfalls](#historical--cross-cutting-collaboration-pitfalls) at end.

---

## WD1: Idle shutdown or “no traffic” heuristics treat the dashboard as absent

**Description:** The relay supervisor uses idle timers or message-based liveness. A dashboard WebSocket may stay connected while the UI is quiet (user reading transcript), or reconnect often during dev (HMR). If idle policy only counts **agent** traffic or certain message kinds, the daemon shuts down while humans still expect oversight — or conversely stays up because the dashboard polls SQLite aggressively and looks “active” in the wrong dimension.

**Risk level:** High

**Warning signs:** Shutdown logs while a browser tab is open; “random” relay exit during long reads; dev-only flakiness when HMR reconnects; product behavior differs between CLI `watch` and dashboard for the same space.

**Prevention strategy:** Define **liveness dimensions explicitly**: open WebSocket count (including dashboard role), **heartbeat** for human/dashboard connections, and membership of **human-capable** sessions in the policy. Treat **dashboard connections** as first-class participants for idle purposes (or use a dedicated **read-only subscriber** channel with its own idle rules documented in one place). Align with existing CP2-style rules: idle must not race **quiet but connected** sessions. Add integration tests: dashboard connected + zero conversation messages + no shutdown for N minutes (configurable).

**Suggested phase:** Relay lifecycle & supervisor policy (early); dashboard real-time feed design (handshake + heartbeat contract).

---

## WD2: Mixing “session client” semantics with “dashboard subscriber” on one WebSocket path

**Description:** Reusing `@agent-talkie/client` or the same handshake as coding-agent sessions for the browser UI without a clear **role** split leads to wrong routing (orchestrator default for “human” messages), accidental participation in space membership, or envelope types the relay does not expect from a browser.

**Risk level:** High

**Warning signs:** Dashboard messages appear as a normal agent session; orchestrator rules fire on UI telemetry; duplicate “human” sessions after each tab refresh; protocol errors only from the web build.

**Prevention strategy:** Specify a **dedicated dashboard join** (or `human.session` with stable credentials) and a **narrow capability set** (subscribe, query, control actions you explicitly allow). Keep transport shared (WebSocket) but **separate message types / state machine** from adapter-driven sessions. Reuse **Zod types from `@agent-talkie/protocol`** in the dashboard bundle; do not fork schema in the UI. Document which client library surfaces are for **adapters** vs **dashboard** so the monorepo does not blur boundaries.

**Suggested phase:** Protocol & relay routing extensions; thin `@agent-talkie/dashboard-client` or documented subset of `@agent-talkie/client`.

---

## WD3: SQLite opened for writes from the dashboard server alongside the relay

**Description:** A common shortcut is embedding `better-sqlite3` (or another driver) in the HTTP server that serves the UI so the API can “just read/write the same file.” The relay is already a writer. Even with WAL, **writes serialize**; two writers across processes multiply `SQLITE_BUSY`, retry storms, and latency spikes. Worst case: well-meaning migrations or pragma changes from a second process.

**Risk level:** Critical

**Warning signs:** Intermittent `database is locked`; spikes when the UI loads; relay and dashboard deployed as separate Node processes both touching the DB; WAL checkpoints behaving oddly under load.

**Prevention strategy:** Default architecture: **relay remains the sole writer**; dashboard gets data via **WebSocket feed + optional read-only HTTP API implemented inside the relay process** (same Node runtime as `openDatabase`) or **read-only** SQLite connections **only** after verifying no writes and consistent `busy_timeout`. If a separate API process is required, use an explicit **outbox / event stream** from relay or a **single-writer service** — not ad hoc dual-writer SQLite. Keep read paths **short transactions**, avoid long-lived read transactions on hot tables.

**Suggested phase:** Persistence & relay integration; dashboard API surface (choose process boundaries before UI work).

---

## WD4: High-frequency SQLite polling from the dashboard backend or SSR

**Description:** Implementing “live” UI by polling transcript or metadata every 100–300 ms from SQLite duplicates work the relay already does, increases disk I/O, and contends with the relay’s write transactions (readers can block behind writers depending on snapshot/isolation).

**Risk level:** Medium–High

**Warning signs:** CPU/disk usage scales with number of open dashboard tabs; `EXPLAIN QUERY PLAN` never runs but load grows linearly with poll rate; relay write latency correlates with dashboard refresh.

**Prevention strategy:** Push **incremental updates** over the existing WebSocket infrastructure (cursor/sequence per resource). Use SQLite reads for **initial snapshot + search** (debounced), not for continuous sync. Apply **throttling and coalescing** server-side if the relay emits fine-grained events.

**Suggested phase:** Real-time feed & snapshot model; search/transcript UX phase (batch + index strategy).

---

## WD5: Real-time update flooding (UI and network)

**Description:** Fan-out of every envelope to the dashboard, or re-sending the full transcript on each event, overwhelms the browser (layout thrashing, huge virtual lists), the WebSocket, and the human’s ability to interpret the stream. Metadata patches every tick amplify traffic O(sessions × events).

**Risk level:** Medium–High

**Warning signs:** DevTools shows MB/s on localhost; frame drops when many agents chat; memory grows with session duration; laptop fans spin on idle spaces with noisy metadata.

**Prevention strategy:** **Delta** payloads, **debounce** metadata views, **coalesce** bursts (requestAnimationFrame or 50–100 ms windows), **cap** message size on wire for dashboard subscribers. For transcript UI, use **virtualized lists** and **incremental fetch** (cursor). Consider **topic subscriptions** (e.g. transcript vs topology vs control) so not every client receives everything.

**Suggested phase:** Dashboard UI architecture; relay fan-out policy for subscribers.

---

## WD6: Split-brain UI state (poll vs push; reconnect race)

**Description:** The UI merges SQLite-backed REST responses with WebSocket-delivered events without a **single ordering model**. After reconnect, the client applies duplicates, misses gaps, or rewinds briefly to stale REST data — classic “flash of wrong state.”

**Risk level:** High

**Warning signs:** Messages briefly disappear; duplicate lines after reconnect; filters/search results disagree with live tail; clock skew causes ordering glitches.

**Prevention strategy:** Assign **monotonic sequence or cursor** for transcript segments in the protocol or relay-side log; client keeps **last_cursor** and reconciles REST snapshot as **initial state only**, then applies live deltas **idempotently**. Align with CP4 themes: never assume global order without an explicit rule. On reconnect, **snapshot + catch-up** from relay (same code path as session resume where applicable).

**Suggested phase:** Real-time sync & protocol sequencing; frontend state store design.

---

## WD7: WebSocket connection lifecycle in dev (HMR, duplicate listeners, leaked timers)

**Description:** Vite HMR can remount components or re-run modules, opening **second WebSocket connections** without closing the first, registering duplicate message handlers, or leaving `setInterval` heartbeats running. This masquerades as relay bugs (double actions, memory growth) but is dev-only.

**Risk level:** Medium (High for developer trust if misdiagnosed)

**Warning signs:** Duplicate console logs for each message; connection count in relay grows with each save; only reproduces in `vite dev`, not in preview/production build.

**Prevention strategy:** Centralize WS creation in a **singleton** or explicit **dispose** hook (`disconnectedCallback` in Lit). Use **`connectOnce` guard** or abort controller per component tree. In dev, log **client instance id** and **close reasons**. Test a **production build** before filing relay issues.

**Suggested phase:** Dashboard foundation (Lit app shell, connection manager); DX checklist in CI or CONTRIBUTING.

---

## WD8: Proxy / dual-origin pitfalls (dashboard dev server vs relay port)

**Description:** Serving the UI from `localhost:5173` while the relay listens on another port breaks **cookies**, **WebSocket upgrade** proxies, and **browser security context** unless `vite.config` proxy + `ws: true` (or explicit `Sec-WebSocket-*` handling) is correct. Misconfiguration shows up as opaque `ECONNRESET` or 404 on upgrade.

**Risk level:** Medium

**Warning signs:** WebSocket works when pointing UI at relay URL directly but fails through dev proxy; mixed content warnings if TLS introduced later.

**Prevention strategy:** Document **one supported dev matrix**: direct WS to relay vs proxied path. If proxied, verify **HTTP upgrade** end-to-end. Prefer **same origin** in production (static assets served from relay HTTP or reverse proxy) to simplify cookies and CSRF if you add session cookies later.

**Suggested phase:** Developer experience & monorepo (Vite config); deployment shape for “dashboard + relay”.

---

## WD9: “Localhost is safe” — XSS, token leakage, and same-machine attackers

**Description:** v2.0 is scoped to loopback, but **any process on the machine** can hit `127.0.0.1`. A malicious or compromised local app can call dashboard APIs, steal **invite/reconnect** tokens exposed in the UI bundle or `localStorage`, or exploit **XSS** in transcript rendering (agents emit untrusted text). **Browser extensions** can inject into pages.

**Risk level:** Medium (elevated if tokens grant space control without extra checks)

**Warning signs:** Transcript rendered as HTML via `innerHTML`; tokens in global JS variables; no CSRF token on state-changing POST from a non-cookie context; dashboard assumes “no attacker on localhost.”

**Prevention strategy:** Treat transcript and metadata as **untrusted**: default **text** or sanitized pipeline; **CSP** for built assets where feasible; **bind relay to loopback** and document threat model. For control actions (orchestrator, invites), require **same-origin** or token tied to **space owner** semantics already in PROJECT.md. Avoid long-lived secrets in `localStorage` without hardening; prefer **httpOnly** cookies only if you add a same-origin server. Rate-limit destructive operations per connection.

**Suggested phase:** Security & control-plane review; transcript rendering component.

---

## WD10: State-changing actions only validated in the UI

**Description:** The dashboard offers buttons for orchestrator designation, invites, or messages, but the relay does not re-validate **authorization** (space owner, membership). A crafted WebSocket client bypasses the UI.

**Risk level:** Critical

**Warning signs:** All checks in Lit components only; relay accepts control envelopes from any connected socket in the space; no audit trail for who changed orchestrator.

**Prevention strategy:** **Authorize on the relay** for every side effect (same as other sessions). UI is never a security boundary. Log control actions with **session_id** and **human** flag.

**Suggested phase:** Relay routing & authorization hardening; any new dashboard control messages.

---

## WD11: Lit / Web Component pitfalls in a data-heavy dashboard

**Description:** Common Lit mistakes: assuming **attribute** reflection for complex objects (everything becomes strings); mutating nested objects without reassignment so **`@state` doesn’t trigger**; heavy work in **`render()`**; leaking **event listeners** on `document`/`window` without cleanup; **shadow DOM** breaking global CSS unless design tokens are wired; **willUpdate**/`updated` used for side effects that should be in explicit controllers.

**Risk level:** Medium

**Warning signs:** Stale UI until unrelated click; attributes show `[object Object]`; memory climbs on navigation; styles inconsistent with design reference (OpenClaw-like stack per PROJECT.md).

**Prevention strategy:** Use **typed properties** for objects/arrays; follow **immutable data patterns** or explicit `requestUpdate`; move networking to **controllers** or dedicated modules; use **CSS variables** and shared token partials for theming across shadow roots. Add **linting** (e.g. custom rules or checklists) for `disconnectedCallback` cleanup.

**Suggested phase:** Dashboard UI architecture & component library bootstrap.

---

## WD12: Monorepo build / bundle duplication and version skew

**Description:** The dashboard bundles its own copy of protocol types, Zod schemas, or message constants. The relay ships another. A minor bump updates one package; the UI **silently mis-parses** or sends obsolete envelopes. Tree-shaking drops “unused” schema pieces that were only for reflection.

**Risk level:** Medium–High

**Warning signs:** Works in workspace protocol tests but fails in built UI; duplicate `node_modules` resolutions for `@agent-talkie/protocol`; different `zod` major in nested deps.

**Prevention strategy:** **Workspace protocol** (`workspace:*`) for internal packages; **single version policy** at root; CI task: **build dashboard + relay** and run **contract tests** against the running relay. Export **JSON Schema** or **fixture messages** as golden tests consumed by both sides.

**Suggested phase:** Monorepo packaging & release gates; CI matrix.

---

## WD13: Serving static dashboard from the wrong process or coupling release cycles

**Description:** Embedding static file serving in the relay without clear boundaries couples **UI releases** to **relay releases**, or tempts ad hoc REST endpoints on the relay HTTP server that bypass the WebSocket protocol. Alternatively, two servers in production complicate CORS and idle behavior (WD1).

**Risk level:** Medium

**Warning signs:** Relay binary grows with every UI asset change; security headers differ between servers; users run old UI against new relay without compatibility checks.

**Prevention strategy:** Choose explicitly: **(A)** static assets from relay process with a **version manifest** and handshake compatibility check, or **(B)** separate static host with documented **origin + API** matrix. Either way, expose **relay generation / version** to the UI (PROJECT.md already values diagnostics). Automate **embedding** build output into `packages/relay` or ship as sibling artifact — but keep **one compatibility story**.

**Suggested phase:** Deployment & packaging; CI artifact layout.

---

## WD14: Supervisor / generation token mismatch after relay restart

**Description:** The dashboard caches `ws://` URL or generation token from a previous relay instance. After supervisor restarts the relay, the UI connects to a **dead generation** or wrong port, shows empty state, or worse, **stale SQLite path** if misconfigured.

**Risk level:** Medium

**Warning signs:** Health endpoint (`/__agent-talkie/v1/health`) disagrees with UI assumptions; reconnect loops; CLI shows data but UI shows nothing.

**Prevention strategy:** On each connection attempt, **verify generation** (existing relay health pattern) before binding UI state. Clear UI cache on **401/403 generation mismatch**. Align dashboard startup with **supervisor discovery** (same env vars / socket path as CLI).

**Suggested phase:** Dashboard connection bootstrap; supervisor integration docs.

---

## WD15: Search / filter implemented as naive `SELECT *` with unbounded result sets

**Description:** Searchable transcript is a v2 requirement. Loading entire transcript into browser memory or running unindexed `LIKE` across large tables blocks the relay event loop (if queries run in-process) or saturates IPC.

**Risk level:** Medium

**Warning signs:** UI freeze on first search; SQLite CPU spikes; OOM in browser for long-running spaces.

**Prevention strategy:** **Pagination**, **FTS5** (or dedicated index) for full-text, **server-side limits**, debounced queries. Run heavy search **off hot relay path** (async worker or read-only connection with strict timeout) if profiling demands it.

**Suggested phase:** Transcript search & storage optimization.

---

## WD16: Testing gap — E2E only in Node, never in a real browser

**Description:** WebSocket logic tested with `ws` in Vitest but **Lit lifecycle**, **HMR**, and **browser WebSocket** semantics differ. Regressions slip until manual demo.

**Risk level:** Medium

**Warning signs:** No Playwright/Cypress in CI; all tests use mocked relay; flakiness only in manual QA.

**Prevention strategy:** At least **one** E2E smoke: open dashboard, connect, receive seeded events. Run **production build** in E2E, not only dev server.

**Suggested phase:** QA / CI hardening after first vertical slice.

---

## Historical — cross-cutting collaboration pitfalls

The following remain important for agent-talkie overall and **interact** with dashboard work; they are not repeated in full here. See git history of this file (pre–2026-04-17) or internal design docs for narrative detail.

| Id   | Topic | Dashboard interaction |
|------|--------|------------------------|
| CP1  | First session as relay host | Dashboard must not become implicit host; same supervisor rules. |
| CP2  | Idle shutdown races | Extended by **WD1** (dashboard liveness). |
| CP3  | Orphan / zombie relay | HMR + duplicate WS (**WD7**) confuses diagnosis. |
| CP4  | Ordering / idempotency | Extended by **WD6** (push vs poll). |
| CP5  | SQLite locking | Extended by **WD3**, **WD4** (second writer / polling). |
| CP6  | Session identity | Applies if dashboard acts as human session (**WD2**). |
| CP7  | Wire versioning | Extended by **WD12** (bundle skew). |
| CP9  | Local vs remote trust | v2 localhost scope; still matters for **WD9**. |
| CP10 | Orchestrator bottleneck | Avoid routing all dashboard traffic through orchestrator unnecessarily. |

---

## Sources & verification notes

- **Project authority:** `.planning/PROJECT.md` — v2.0 web dashboard milestone, Lit + Vite reference, SQLite + WebSocket constraints, localhost scope.
- **SQLite WAL / locking:** [SQLite WAL mode](https://www.sqlite.org/wal.html) — single-writer model supports **WD3**, **WD4**, **WD5** (HIGH confidence for locking semantics).
- **WebSocket ordering:** RFC 6455 — ordered delivery per connection; supports **WD6** ordering discipline (HIGH confidence).
- **Lit patterns:** Verify property/reactivity and lifecycle guidance against current [Lit documentation](https://lit.dev/docs/) during implementation (**WD11**, MEDIUM confidence for specific API names).

---

## Suggested phase → pitfall index

| Thematic phase | Pitfalls |
|----------------|----------|
| Relay lifecycle & supervisor | WD1, WD14 |
| Protocol / subscriber model | WD2, WD6, WD10 |
| Persistence & SQLite access | WD3, WD4, WD15 |
| Real-time fan-out & UI performance | WD5, WD16 |
| Lit dashboard foundation | WD7, WD8, WD11 |
| Security (localhost) | WD9, WD10 |
| Monorepo, build, CI | WD12, WD13, WD16 |
