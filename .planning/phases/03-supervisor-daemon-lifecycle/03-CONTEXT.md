# Phase 3: Supervisor & daemon lifecycle - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The local relay daemon starts automatically when needed (on-demand spawn), enforces single instance via lockfile with generation tokens, idles down safely after a configurable grace period, and is operable via npm/npx without separate infrastructure setup. No postinstall persistent background processes, no system-level service managers.

</domain>

<decisions>
## Implementation Decisions

### Daemon Spawn Strategy
- **D-01:** Both CLI manual control and client auto-spawn. Auto-spawn is the default happy path — when a session client tries to connect and finds no relay, it spawns one automatically. CLI exposes explicit start/stop/status for inspection, recovery, and troubleshooting. **Phase 3 scope:** build the `ensureRelayRunning()` supervisor mechanism and expose it via CLI; actual session-client wiring (calling `ensureRelayRunning` before WebSocket connect) is deferred to Phase 4 adapters, which will import and use the supervisor library.
- **D-02:** Spawn mechanism is `child_process.fork()` with a short IPC handshake. The forked relay process confirms readiness via IPC message after binding its port, then the parent disconnects the IPC channel and the relay continues as an independent process.
- **D-03:** Readiness signal is IPC-based — relay emits a structured ready message (including bound port) via IPC after successfully binding. The spawning client reads this before detaching, ensuring the relay is accepting connections before the client proceeds.
- **D-04:** No postinstall persistent daemons. No system-level service manager dependency. The relay is purely on-demand: spawned when needed, shuts down when idle.

### Data & Lockfile Location
- **D-05:** XDG/platform convention for all relay data (SQLite DB, lockfile, logs). Linux: `~/.local/share/agent-talkie/`, macOS: `~/Library/Application Support/agent-talkie/`.
- **D-06:** Lockfile lives in the same data directory as other relay state (e.g. `relay.lock`). Consistent location, no separate runtime directory.

### Lockfile & Single-Instance
- **D-07:** Lockfile contains PID + port + generation token. The generation token is a random value written at relay startup. Stale lock is detected when the process at PID is dead or doesn't hold the matching generation token.
- **D-08:** Auto-replace stale locks after explicit confirmation that the lock is stale (PID dead or generation-token ownership check fails). No manual cleanup required for the common stale-lock case. Planner should include conservative checks to avoid deleting a live lock by mistake.

### Idle Shutdown
- **D-09:** Configurable idle timer with a sensible default (5 minutes). Override via environment variable or config. After the last WebSocket connection closes, the relay waits for the grace period, then shuts down.
- **D-10:** No connections = shutdown eligible. Disconnected-but-registered session memberships do not prevent shutdown. SQLite durable state is sufficient — reconnecting clients re-trigger relay spawn and recover from persisted state.
- **D-11:** Graceful drain on SIGTERM/SIGINT — stop accepting new connections, close existing WebSocket connections with a close frame, flush SQLite WAL, release lockfile, exit cleanly. Shutdown must be bounded (not hang indefinitely waiting for perfect drain).

### Agent's Discretion
- CLI command naming and structure (binary name, subcommand layout)
- Exact generation token format and size
- Exact idle timer env var name and config file format
- Shutdown drain timeout value
- Exact IPC message schema for readiness signal
- npx entrypoint design and package structure decisions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product & Architecture
- `PRD.md` — Product vision, zero-external-services constraint, relay lifecycle independence
- `ARCHITECTURE-CONSTRAINTS.md` — Hard constraints: relay lifecycle must not depend on one participant staying alive, first session must not become permanent special host

### Research
- `.planning/research/ARCHITECTURE.md` — Component boundaries, relay responsibilities, recommended project structure
- `.planning/research/STACK.md` — Recommended library versions (better-sqlite3, uuid, ws)
- `.planning/research/PITFALLS.md` — CP5 (SQLite locking/WAL), CP6 (session id != connection id)

### Upstream Phase Decisions
- `.planning/phases/01-protocol-persistence-foundation/01-CONTEXT.md` — SQLite schema approach (D-07: raw better-sqlite3, numbered migrations), session identity model (D-04: UUID v7)
- `.planning/phases/02-relay-websocket-validate-route/02-CONTEXT.md` — Relay server design (createRelayServer), reconnect secret (D-09–D-12), space lifecycle (D-01–D-04), default port 18765

### Existing Code
- `packages/relay/src/server.ts` — `createRelayServer()` function, `DEFAULT_RELAY_PORT`, `LISTEN_HOST`, close/cleanup logic
- `packages/relay/src/index.ts` — Current relay exports
- `packages/relay/package.json` — Current relay package dependencies and build setup

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createRelayServer()` in `packages/relay/src/server.ts` — already handles port binding, WebSocket setup, session registry, space lifecycle, and clean shutdown. The supervisor wraps this function.
- `openDatabase()` and `migrate()` in `packages/persistence/` — database initialization that the daemon will invoke on startup
- `DEFAULT_RELAY_PORT` (18765) and `LISTEN_HOST` ("127.0.0.1") — already defined constants

### Established Patterns
- Monorepo with `packages/*` workspaces (protocol, persistence, relay)
- tsup for building, vitest for testing
- ESM modules (`"type": "module"`)
- better-sqlite3 with WAL mode for concurrency

### Integration Points
- New supervisor/daemon code wraps existing `createRelayServer()`
- CLI package will need to import from `@agent-talkie/relay` and the new supervisor module
- Lockfile management is new infrastructure — no existing lockfile code
- Data directory management (XDG paths) is new infrastructure

</code_context>

<specifics>
## Specific Ideas

- The relay should feel like it's always there — "just connect and it works." The daemon lifecycle is invisible to the user in normal operation.
- Stale lock recovery should be automatic and conservative — never delete a live lock, but also never require manual cleanup for the common crash-left-stale-lockfile case.
- Graceful shutdown should be bounded, not hang waiting for stragglers — close frames, WAL flush, lockfile cleanup, then exit.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-supervisor-daemon-lifecycle*
*Context gathered: 2026-04-13*
