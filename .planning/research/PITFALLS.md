# Domain Pitfalls — Cross-Runtime, Relay-Based, Local-First Collaboration Layer

**Product:** agent-talkie — local-first, relay-based WebSocket collaboration for coding-agent sessions (npm package + automatic local relay daemon; SQLite; zero external services by default).

**Researched:** 2026-04-10

**Scope:** Pitfalls specific to relay daemons, WebSocket fan-out, SQLite under multi-process/multi-session load, cross-runtime adapters, protocol evolution, session identity, and extending local-first to remote relays — not generic distributed-systems platitudes.

**Overall confidence:** MEDIUM — grounded in PROJECT.md, PRD.md, ARCHITECTURE-CONSTRAINTS.md; SQLite/WebSocket/daemon patterns cross-checked with common failure modes and public documentation themes. Phase labels are thematic until ROADMAP.md exists.

---

## Critical Pitfalls

### CP1: Treating the first connected session as the relay host

**What goes wrong:** The “whoever connects first spawns the daemon” session becomes a hidden SPOF. When that IDE or terminal closes, the relay dies or migrates awkwardly; other sessions see flapping channels, duplicate spaces, or “ghost” participants.

**Why it happens:** Easiest bootstrap is `child_process.spawn` from the first client; product wording says “automatic daemon” without spelling out **relay-owned process identity** (PID file, lock, port lease).

**Consequences:** Violates ARCHITECTURE-CONSTRAINTS: “relay lifecycle must not depend on one participant”; “first session must not become permanent special host.”

**Prevention:** Define a **relay supervisor model**: single OS-level relay instance per workspace/channel lease (or per user-scoped socket), with explicit **adoption** if the supervisor dies. Clients only attach; they never “own” the relay’s lifetime beyond a bounded grace period.

**Warning signs:** Docs or code say “parent process”; relay PID equals a client PID; no lockfile or port conflict story; killing one IDE kills everyone’s channel.

**Primary phase:** Relay daemon bootstrap & lifecycle (before scaling adapters).

---

### CP2: Idle shutdown that races active sessions

**What goes wrong:** A timer shuts the daemon after “no messages for N minutes” while WebSockets are still open but quiet, or while a long native approval is pending. Sessions disconnect mid-coordination; SQLite checkpoints or WAL growth interact badly with abrupt exit.

**Why it happens:** Idle detection keyed only on **traffic**, not on **membership + intent** (joined, orchestrator assigned, human-visible pending state).

**Prevention:** Idle policy must consider: open WebSocket count, explicit “session present” heartbeats, **pending protocol state** (unacked idempotent ops, in-flight invites), and configurable minimum lifetime after last join. Prefer **soft idle** (stop accepting new joins) before **hard shutdown**.

**Warning signs:** Bugs filed as “random disconnect overnight”; shutdown logs show timer firing with non-zero connections; flaky tests only under load.

**Primary phase:** Daemon lifecycle & operational policy.

---

### CP3: Orphan / zombie relay processes after parent exit

**What goes wrong:** `npx` or IDE kills the adapter; the relay keeps running on a stale port, or conversely the relay dies and leaves lockfiles/sockets. Next start fails with EADDRINUSE or connects to the wrong generation.

**Why it happens:** Detached `spawn` without a **process group** story; no cleanup on `SIGTERM`/`SIGHUP`; Windows vs Unix signal semantics ignored; npm lifecycle hooks don’t stop daemons.

**Prevention:** Use a **generation token** (written atomically) + **lockfile with stale detection** (PID alive check). On relay start, reconcile port, lock, and DB path. Document `agent-talkie relay stop` / `--force`. Prefer **stdio or IPC parent heartbeat** only as a *supplement*, not the sole liveness definition (violates participant-independent lifecycle if misapplied).

**Warning signs:** `lsof` shows stray node processes; users learn `kill -9` as the fix; CI leaves listeners behind.

**Primary phase:** Daemon bootstrap; packaging (`npm`/CLI).

---

### CP4: Assuming total message ordering across the whole space

**What goes wrong:** Clients infer global order from WebSocket delivery order; after reconnect, duplicates or reordering breaks idempotency keys, orchestrator summaries, and “last message wins” metadata.

**Why it happens:** WebSocket is a **single ordered stream per connection**, not a distributed log. Multiple writers + fan-out + reconnects = **per-connection** order, not **causal** order unless you add it.

**Prevention:** Protocol-level **logical timestamps or version vectors per resource**, **monotonic sequence per session**, and **idempotency keys** on side effects. Define whether the relay assigns **global sequence numbers** (single writer to the log) or whether clients merge with CRDT-style rules for metadata only. Never rely on wall clock alone for ordering.

**Warning signs:** “Works on my machine” until Wi‑Fi blip; duplicate handler execution; orchestrator double-assigns work.

**Primary phase:** Core protocol & message envelope; relay routing.

---

### CP5: SQLite “works in dev” then `database is locked` under real concurrency

**What goes wrong:** Multiple adapters + relay + CLI hit the same DB; default journal mode, missing `busy_timeout`, long transactions, or **write transactions that span await** cause `SQLITE_BUSY` storms.

**Why it happens:** SQLite allows concurrent readers with WAL, but **writes serialize**. A relay that batches many session updates in one big transaction blocks everyone.

**Prevention (actionable):** Enable **WAL**; set **`busy_timeout`** on every connection; keep write transactions **short**; consider a **single writer queue** in the relay process for metadata mutations; separate **hot read paths** from writes; avoid holding DB locks across I/O. For multi-process access to the same file, treat “relay is sole writer, others read via API” as the default shape unless profiling proves otherwise.

**Warning signs:** Spiky latency; errors only when >2 sessions; relay event loop stalls correlate with DB writes.

**Primary phase:** Persistence & schema; relay integration with store.

**Confidence:** MEDIUM — aligns with SQLite locking model (single-writer commits); verify exact PRAGMA defaults for your Node SQLite driver in implementation phase.

---

### CP6: Session identity tied to connection id or WebSocket handle

**What goes wrong:** Reconnect creates a “new” session; orchestrator state, invites, and human-visible names desync; duplicate participants with the same display name.

**Why it happens:** Easy to key rows in SQLite by `connId`; PRD requires **stable session identity** across reconnects and runtimes.

**Prevention:** Separate **session_id** (stable, chosen at join / persisted in adapter config) from **connection_id** (ephemeral). Persist session credentials locally per adapter (e.g. machine-local file under user config) so Cursor/Codex/Claude Code reconnect as the **same** session. Collision policy: explicit disambiguators per PROJECT.md default decisions.

**Warning signs:** Every reconnect shows “joined” events; duplicate rows; human sees two `reviewer-1` with different ephemeral ids.

**Primary phase:** Session model & join protocol; adapter local state.

---

### CP7: Protocol versioning only in TypeScript types, not on the wire

**What goes wrong:** Non-TS adapters (or older package versions) send payloads the relay rejects or misroutes silently after a minor bump.

**Why it happens:** Zod validates locally; JSON Schema export lags; envelope `version` optional “for now.”

**Prevention:** **Mandatory** envelope version + **capability negotiation** at handshake. Relay behavior: explicit **reject with structured error** vs **downgrade path** per message kind. Keep JSON Schema generation in CI as a **release gate**. Document **compatibility matrix** (relay version × adapter min).

**Warning signs:** “Undefined” fields after upgrade; partial upgrades in one workspace; bug reports without version tuples.

**Primary phase:** Protocol & schema; release engineering.

---

### CP8: Cross-runtime adapters sharing one blocking stdio bridge

**What goes wrong:** Claude Code / Codex / Cursor adapters deadlock or drop chunks when binary data, large payloads, or JSON lines span flush boundaries; backpressure stalls the native runtime.

**Why it happens:** Treating stdio as “free IPC” without framing, length prefixing, or flow control.

**Prevention:** **Framed messages** (length-prefixed or NDJSON with max line size), **strict caps**, **async pump** in adapter with bounded queues, clear **error surface** to the human when the bridge is overloaded. Keep stdio at the **adapter edge**; core remains WebSocket semantics (ARCHITECTURE-CONSTRAINTS).

**Warning signs:** Truncated JSON; intermittent parse errors; memory growth in adapter.

**Primary phase:** Adapter ingress per runtime.

---

### CP9: Local-first relay reused for remote without auth/threat model

**What goes wrong:** Same handshake as localhost is exposed on a LAN or tunnel; anyone who can open the port joins; SQLite becomes exfiltration surface for collaboration metadata and transcripts.

**Why it happens:** “Remote is just another relay” without **join secrets, invite tokens, binding to interface**, and **TLS termination** story.

**Prevention:** **Explicit trust mechanism** for cross-machine (PRD). Default bind to **loopback**; remote mode requires **token + optional mTLS or SSH tunnel** documented as the supported path. Separate **admin** operations from **session** operations in the protocol.

**Warning signs:** Relay listens on `0.0.0.0` by accident; no audit of who joined; metadata includes paths or secrets.

**Primary phase:** Remote extension & invite/join design; hardening pass.

---

### CP10: Orchestrator as mandatory relay bottleneck

**What goes wrong:** Every session-to-session message funnels through orchestrator process or DB row, killing latency and violating “direct session-to-session messaging.”

**Why it happens:** Easiest routing table; conflating **control plane** with **data plane**.

**Prevention:** Relay routes **peer messages** by session id; orchestrator consumes **role-specific** topics or filters, not all traffic. Metadata updates orchestrator owns ≠ all payloads.

**Warning signs:** Orchestrator CPU scales with message count; protocol docs say “send to orchestrator first.”

**Primary phase:** Routing design; orchestrator role implementation.

---

## Technical Debt Patterns

| Pattern | Why it bites later | Prevention | Phase |
|--------|-------------------|------------|--------|
| “We’ll add idempotency later” | Reconnect retries duplicate side effects | Define idempotency keys for join, metadata patch, assignment ops from v1 | Protocol |
| Implicit channel = process cwd | Teams with multiple repos get wrong space | Explicit channel/space id; workspace labels are metadata, not sole key | Session & join |
| Global mutex around all SQLite calls | Fixes locks, kills throughput | WAL + short txs + writer queue; measure before mutex | Persistence |
| Feature flags only in clients | Relay and adapters drift | Version handshake + relay-side rejection rules | Protocol / release |
| Logging PII (paths, tokens) | Trust story breaks; GDPR-style issues | Redact by default; structured logs with field allowlist | Security & ops |
| Single JSON blob for all metadata | Migration pain; partial updates expensive | Normalized tables + patch/version per field group | Schema |

---

## Integration Gotchas

1. **npm postinstall spawning long-lived daemons** — surprises users/CI; violates expectations. Prefer **on-demand** start via CLI or first `connect`.
2. **Different Node versions per runtime** — adapter and relay may diverge; pin engines and test matrix.
3. **Cursor vs CLI cwd** — session workspace metadata wrong; adapters must pass explicit workspace root from runtime API when available.
4. **Firewall / VPN** — WebSocket to `localhost` still works; remote extension fails mysteriously; document loopback vs LAN.
5. **SQLite on network filesystems** — NFS/cloud sync folders corrupt or lock; warn against putting the DB in synced directories.
6. **Terminal multiplexers** — orphan signals differ under tmux; test daemon parent/child assumptions.
7. **Concurrent package major bumps** — one adapter on envelope v1, relay on v2; require relay to advertise supported range and fail fast.

---

## Performance Traps

- **Fan-out broadcast** to N sessions on every metadata tick → O(N²) traffic; use **delta patches** and **debounced** visibility updates (PRD: hybrid metadata upkeep).
- **Large message payloads** through relay memory — cap size, stream or chunk for artifacts (keep core narrow; harnesses carry bulk context).
- **Checkpoint storms** — many small writes without WAL tuning; monitor WAL size and checkpoint intervals.
- **Synchronous SQLite** on relay hot path — blocks Node event loop; use async driver patterns and avoid fsync-per-message defaults without measurement.

---

## Security Mistakes

- Listening on all interfaces with no auth “for dev convenience.”
- Storing invite tokens or relay secrets in world-readable files in the repo.
- **Trusting session display names** for ACL — must use **session_id + proof** (token or local attestation model you define).
- **Injection via message content** into HTML human surface — treat as untrusted; sanitize or render as plain text first.
- **Path leakage** in workspace metadata — PRD says minimal by default; enforce allowlist for exported fields.

---

## UX Pitfalls

- **Silent reconnect** — human thinks messages were delivered; show connection state and last-sync time on the human-visible surface.
- **Ambiguous “who is orchestrator”** after reconnect — PRD open question; need visible role and **recovery** when orchestrator disappears.
- **Spam join prompts** — violates explicit opt-in; require explicit invite/token even on LAN.
- **Blaming the wrong runtime** for disconnects — surface **relay generation / version** in diagnostics.

---

## “Looks Done But Isn’t” Checklist

- [ ] Kill every IDE session; relay still meets lifecycle spec (survives or clean shutdown with clear next step).
- [ ] Pull network cable mid-message; **no duplicate side effects** after restore (idempotency verified).
- [ ] Two humans, same display name prefix; **disambiguators** appear and routing stays unambiguous.
- [ ] Mixed package versions; user sees **actionable** incompatibility error, not opaque parse failure.
- [ ] SQLite path on Dropbox/iCloud — documented unsupported or detected with warning.
- [ ] Windows + macOS CI: **no orphan listeners** after test suite.
- [ ] Orchestrator crash/disconnect; channel **degrades gracefully** (policy: election vs human reassignment — must be defined, not “undefined behavior”).
- [ ] Remote relay: **non-loopback** bind requires explicit token/TLS/tunnel per docs.

---

## Recovery Strategies

| Failure | Detection | Recovery |
|--------|-----------|----------|
| Stale lockfile / wrong generation | Start errors; connect to “wrong” channel | Generation token bump; `relay stop --force`; document wipe of **only** runtime state files |
| WAL growth / corruption suspicion | Tooling reports integrity check fail | Backup DB; `PRAGMA integrity_check`; restore from export/transcript mirror if you add one |
| Partitioned client | Heartbeat timeout; UI shows degraded | Auto-reconnect with backoff; surface unsent queue; human-triggered “flush” optional |
| Protocol mismatch | Handshake error with version tuple | Pin adapter; upgrade relay; compatibility table |
| Token leak (remote) | Audit | Rotate invite secret; invalidate sessions; shorten TTL |

---

## Pitfall-to-Phase Mapping

Use this table when ROADMAP phases are named; adjust IDs when `.planning/ROADMAP.md` exists.

| Thematic phase | Pitfalls primarily addressed |
|----------------|------------------------------|
| Relay daemon bootstrap & lifecycle | CP1, CP2, CP3; Technical debt: on-demand start |
| Core WebSocket protocol & routing | CP4, CP10; Performance: fan-out |
| SQLite schema & persistence | CP5; Technical debt: mutex/blob |
| Session identity, join, channel model | CP6; Integration: cwd |
| Envelope versioning, Zod, JSON Schema | CP7 |
| Per-runtime adapters (ingress) | CP8; Integration: Node/cwd |
| Human-visible surface / orchestrator UX | CP10 (routing), UX section, CP6 |
| Remote extension, invite/trust | CP9; Security section |
| Hardening, CI, release gates | “Looks done”; CP7; orphan processes |

---

## Sources

- **Project authority:** `.planning/PROJECT.md`, `PRD.md`, `ARCHITECTURE-CONSTRAINTS.md` — constraints on relay independence, SQLite, WebSocket, adapters, explicit opt-in, orchestrator role, metadata ownership.
- **SQLite concurrency model (locking/WAL):** [SQLite WAL documentation](https://www.sqlite.org/wal.html) — single-writer semantics; basis for CP5 prevention (HIGH confidence for model; MEDIUM for exact Node driver defaults).
- **SQLite concurrent access discussion (patterns):** [Stack Overflow — multiple process access](https://stackoverflow.com/questions/75550581/sqlite-best-practices-for-dealing-with-multiple-process-access) — practical busy_timeout/WAL themes (MEDIUM confidence).
- **WebSocket semantics:** IETF RFC 6455 — ordered reliable delivery **per connection**; cross-connection total order not implied (HIGH confidence for CP4).
- **Process/orphan classes:** general Node `child_process` + signal behavior on Unix vs Windows (MEDIUM confidence; verify with implementation tests).

---

## Gaps for phase-specific research

- Exact **orchestrator failover** algorithm (PRD open question) — needs a dedicated design phase.
- **Transcript durability** split SQLite vs export (ARCHITECTURE-CONSTRAINTS open) — affects CP5 and backup/recovery.
- **Auth model** for remote relay — legal/compliance and enterprise constraints not covered here.
