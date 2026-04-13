# Phase 3: Supervisor & daemon lifecycle - Research

**Researched:** 2026-04-13  
**Domain:** Node.js local daemon supervision, single-instance locks, IPC readiness, npm/npx CLI packaging, idle shutdown policy  
**Confidence:** HIGH for Node/npm mechanics and locked CONTEXT decisions; MEDIUM for stale-lock liveness edge cases (PID reuse, port conflict) until a concrete probe algorithm is specified

## Summary

Phase 3 wraps the existing `createRelayServer()` relay with a **supervisor** that can **auto-spawn** a dedicated Node child via **`child_process.fork()`**, confirm **readiness over IPC**, then **disconnect** so the relay lifetime is **not tied to the spawning client**—satisfying RELAY-04/05 and ARCHITECTURE-CONSTRAINTS (no “first session owns the relay”) [CITED: `03-CONTEXT.md` D-01–D-04; `.planning/research/PITFALLS.md` CP1].

**Single-instance** enforcement uses a **user-data-dir lockfile** (`relay.lock`) containing **PID, bound port, and a generation token**, with **conservative stale detection and auto-replacement** when the lock is provably stale [CITED: `03-CONTEXT.md` D-07–D-08]. This is **custom file semantics**; libraries like `proper-lockfile` help with **advisory locks** but do not replace the **token + liveness** story the product asked for [VERIFIED: npm `proper-lockfile@4.1.2` exists; design choice is CONTEXT, not library feature parity].

**Idle shutdown** starts a timer when **WebSocket count hits zero**, after a **configurable grace period (default 5 minutes)**; **disconnected session memberships** must **not** block shutdown—SQLite is the source of truth for resume/rejoin [CITED: `03-CONTEXT.md` D-09–D-11]. Planners must align “**no pending protocol state**” (RELAY-07) with Phase 2 realities: **no offline mailbox** [CITED: `02-CONTEXT.md` D-05], synchronous `better-sqlite3` in the hot path—**pending** should mean **in-process work** (e.g. incomplete catch-up, unfinished graceful close, timers) rather than “rows still exist in SQLite” [ASSUMED: requirement interpretation—confirm in PLAN if product intends stricter gates].

**CLI & packaging** add an **`npm`/`npx`-friendly binary** using a small CLI framework (**`commander`**, current **`14.0.3`** on npm [VERIFIED: `npm view commander version`]) plus **`env-paths@4.0.0`** (or equivalent) for **XDG-aligned directories** [VERIFIED: `npm view env-paths version`]; CONTEXT pins macOS/Linux paths explicitly [CITED: D-05].

**Primary recommendation:** Implement **`packages/supervisor`** (or equivalent) that owns fork+IPC+lock+XDG paths, consumed by **`packages/cli`** with `bin` entries; keep **`@agent-talkie/relay`** as the library that **`createRelayServer()`** lives in, with a **thin daemon entry module** forked by the supervisor [CITED: `03-CONTEXT.md` canonical_refs; `.planning/research/ARCHITECTURE.md` structure].

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Both CLI manual control and client auto-spawn. Auto-spawn is default; CLI exposes start/stop/status.
- **D-02:** Spawn mechanism is `child_process.fork()` with short IPC handshake; parent disconnects IPC after ready; relay continues independently.
- **D-03:** Readiness signal is IPC-based — structured ready message (including bound port) after bind; parent waits before detaching.
- **D-04:** No postinstall daemons; no system service manager; on-demand spawn and idle shutdown only.
- **D-05:** XDG/platform convention — Linux `~/.local/share/agent-talkie/`, macOS `~/Library/Application Support/agent-talkie/`.
- **D-06:** Lockfile in same data directory (e.g. `relay.lock`).
- **D-07:** Lockfile: PID + port + generation token; stale = PID dead or generation ownership check fails.
- **D-08:** Auto-replace stale locks after explicit stale confirmation; conservative checks—never delete a live lock.
- **D-09:** Configurable idle timer, default 5 minutes; env or config override.
- **D-10:** No connections ⇒ shutdown eligible; disconnected memberships do not prevent shutdown; SQLite durable state suffices.
- **D-11:** Graceful drain on SIGTERM/SIGINT — stop accept, close WS with close frame, flush SQLite WAL, release lock, bounded exit.

### Claude's Discretion

- CLI naming and subcommand layout  
- Generation token format and size  
- Idle timer env var name and config file format  
- Shutdown drain timeout value  
- IPC message schema for readiness  
- npx entrypoint and package structure details  

### Deferred Ideas (OUT OF SCOPE)

- None per CONTEXT.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RELAY-04 | Relay auto-spawns on first local use | Fork + IPC readiness [CITED: Node.js `child_process.fork` docs]; supervisor “ensure relay” before connect |
| RELAY-05 | Lifecycle independent of any participant | Detached relay process + disconnect IPC [CITED: Node.js `subprocess.disconnect`]; not embedding relay in client process |
| RELAY-06 | Single instance + generation token stale detection | Custom lockfile fields [CITED: D-07–D08]; PID liveness + port/token probe patterns below |
| RELAY-07 | Idle shutdown when no WS and no pending protocol state | WS connection counting + timer [CITED: D-09–D10]; define “pending” vs durable SQLite [ASSUMED] |
| CLI-01 | `npm install` / `npx` without separate infra | `package.json` `bin`, published package layout [CITED: npm docs pattern]; no postinstall [CITED: D-04] |
| CLI-02 | Relay start/stop/status + session-oriented commands | `commander` subcommands [VERIFIED: npm]; session commands may delegate to client library in later phases |
| CLI-03 | Transparent auto-start for basic local use | Shared “ensureRelayRunning()” used by CLI and future client [CITED: D-01] |
</phase_requirements>

## Project Constraints (from .cursor/rules/)

From `.cursor/rules/gsd-context.md` (mirrors product + stack research):

- **Zero external services** on the default path; **SQLite + local relay** remain canonical.
- **Packaging:** install/run via **npm/npx**; **automatic local daemon** is a product constraint.
- **Relay lifecycle** must **not** depend on one participant staying alive; **first session must not be a special permanent host**—supervisor/fork model aligns.
- **GSD workflow:** prefer GSD entry points for repo work; this artifact is planning-only.
- **Stack table in rules** mentions **`execa`** and **`proper-lockfile`** for daemon UX—**Phase 3 CONTEXT overrides spawn to `fork` + custom lockfile**; do not treat `execa` as the locked spawn API for this phase [CITED: `03-CONTEXT.md` D-02 vs gsd-context stack narrative].

## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `node:child_process` **`fork`** | Node 20+ (repo `engines >=20`) | Spawn relay Node process with IPC | Locked in CONTEXT; official IPC + `disconnect()` [CITED: https://nodejs.org/api/child_process.html] |
| `node:fs` / `node:fs/promises` | built-in | Atomic lockfile write, read, cleanup | No dependency for core lock semantics |
| `commander` | **14.0.3** [VERIFIED: npm] | CLI parsing for `bin` | Listed in project stack research; minimal surface |
| `env-paths` | **4.0.0** [VERIFIED: npm] | User data dir (`data`) consistent with XDG | CONTEXT names paths explicitly—implementations can hardcode or use `env-paths` with app name `agent-talkie` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `execa` | 9.6.1 [VERIFIED: npm] | Cross-platform spawn helpers | **Not** the locked IPC-ready path for relay child; optional for non-Node helpers only [CITED: CONTEXT D-02] |
| `proper-lockfile` | 4.1.2 [VERIFIED: npm] | Advisory file locks | Optional **supplement** to prevent races; **does not** implement PID+port+generation **stale narrative** by itself |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fork` + IPC | `spawn` + stdout “ready” line | Loses structured IPC; stdout parsing is brittle with log noise |
| Custom lockfile | `proper-lockfile` only | No generation token story; stale PID detection still needed |
| Hardcoded paths | `xdg-basedir` / manual | `env-paths` reduces cross-platform drift for Windows later |

**Installation (illustrative):**

```bash
npm install commander env-paths
```

**Version verification:** `npm view commander version` → 14.0.3; `npm view env-paths version` → 4.0.0 (2026-04-13).

## Architecture Patterns

### Recommended layout

```text
packages/
  relay/           # createRelayServer + daemon entry script (fork target)
  supervisor/      # ensureRunning, lockfile, idle policy hooks (library)
  client/          # (future) calls supervisor before WS connect
  cli/             # bin: talkie — start|stop|status|session…
```

[CITED: `.planning/research/ARCHITECTURE.md` recommended structure; adjusted to match existing `packages/*` workspaces.]

### Pattern: Fork, wait for IPC ready, disconnect

**What:** Parent forks a module that binds the HTTP/WS server, then sends a JSON message `{ type: 'relay.ready', port, generation, ... }` via `process.send()`. Parent awaits `'message'` once, validates shape, calls `child.disconnect()` (or child calls `process.disconnect()`), then proceeds to open WebSocket.

**When:** Every auto-spawn and explicit `relay start` that should return quickly after bind.

**Example:**

```js
// Source: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options
// Conceptual — discretion on exact schema per CONTEXT
import { fork } from 'node:child_process';

const child = fork(new URL('./relay-daemon.js', import.meta.url), [], {
  env: { ...process.env, AGENT_TALKIE_DATA_DIR: dataDir },
  stdio: ['ignore', 'inherit', 'inherit'], // or 'ignore' all for quiet daemon
});
child.once('message', (msg) => {
  if (isReady(msg)) {
    child.disconnect();
    connectClient(msg.port);
  }
});
```

**Anti-patterns:**

- **Parent keeps IPC open “for health”** — risks tying parent lifetime or leaking handles; use **lockfile + port probe** for status [CITED: PITFALLS CP3].
- **Spawning relay inside the client process** — violates independent lifecycle [CITED: PITFALLS CP1].

### Pattern: Stale lock detection (conservative)

**What:** On startup: if lockfile missing → acquire. If present → parse PID, port, token. If **`kill(pid, 0)`** (or Windows equivalent) fails → stale. If PID alive → **connect to `127.0.0.1:port`** (TCP or WS) and verify relay identity matches **token** (HTTP health or first WS frame / side channel—planner chooses one explicit mechanism). Only delete lock when stale per D-08.

**Why:** **PID reuse** can make “PID alive” insufficient; **token** proves the running relay is the lock owner [ASSUMED: standard practice; aligns with D-07 wording].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform data home | String-concat paths | `env-paths` or CONTEXT-fixed table | Windows support later; fewer bugs |
| CLI argv parsing | Manual `process.argv` | `commander` | Subcommands, help, stability |
| IPC between Node parent/child | Raw TCP to localhost for readiness | `fork` + `process.send` | Built-in, typed channel, documented [CITED: Node.js docs] |
| “Is port free?” | Hope | `server.listen` + error handling or `net.createServer` probe | EADDRINUSE is ground truth |

**Key insight:** The **lockfile format and stale policy** are product-specific—use **small dedicated helpers** (read/write JSON atomically with `writeFile` + `rename`), not a generic lock library alone.

## Common Pitfalls

### Pitfall 1: Idle shutdown races (quiet but connected)

**What goes wrong:** Timer fires while connections are still open but idle, or **catch-up** is still streaming after last join.

**Why:** Idle keyed only on “no messages” instead of **open socket count** + **in-flight relay work** [CITED: PITFALLS CP2].

**How to avoid:** Gate idle on **`wss.clients.size === 0`** (or equivalent) and **no deferred timers/work queues**; document semantics vs RELAY-07.

### Pitfall 2: Parent exit kills relay on Windows / terminal tools

**What goes wrong:** Wrong `stdio`/`detached` combo; IDE kills parent and takes child.

**Why:** Platform-specific process groups [CITED: Node.js `options.detached` docs].

**How to avoid:** After IPC handshake, **disconnect**; consider **`detached` + `unref()`** where appropriate; test on Windows if supported.

### Pitfall 3: Forked module path in ESM

**What goes wrong:** `fork` target wrong under `tsup` dist vs source.

**Why:** ESM requires resolvable file; dev vs prod paths differ.

**How to avoid:** Fork **compiled `dist/*.js`** entry; integration test runs against built output [ASSUMED: monorepo norm].

### Pitfall 4: SQLite + abrupt exit

**What goes wrong:** WAL not checkpointed; lockfile left while process zombied.

**Why:** CP5 — need graceful `close()` from `createRelayServer` [CITED: `packages/relay/src/server.ts` `close` drains WSS and closes DB].

**How to avoid:** Wire **SIGTERM/SIGINT** to `close()` with **overall timeout** (discretion) then `process.exit` [CITED: D-11].

## Code Examples

### subprocess.disconnect() semantics

From Node.js documentation: closing the IPC channel allows the child to exit when nothing else keeps it alive; after disconnect, `subprocess.connected === false` [CITED: https://nodejs.org/api/child_process.html#subprocessdisconnect].

### createRelayServer already returns close()

The relay exposes async cleanup suitable for graceful shutdown:

```434:458:packages/relay/src/server.ts
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(spaceGcInterval);
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            db.close();
          } catch {
            /* ignore */
          }
          server.close((e) => {
            if (e) {
              reject(e);
            } else {
              resolve();
            }
          });
        });
      }),
```

Planner note: D-11 asks for **close frames** before terminate where possible—current code uses **`terminate()`**; Phase 3 may extend `close()` to prefer **`ws.close()`** with a short timeout [ASSUMED: incremental hardening].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Parent-watched daemon | Fork + disconnect IPC | CONTEXT 2026-04-13 | Participant-independent process |
| PID-only lockfiles | PID + port + generation + probe | CONTEXT 2026-04-13 | Safer stale recovery |

**Deprecated for this phase:** `npm postinstall` start scripts [CITED: D-04].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | RELAY-07 “pending protocol state” excludes durable SQLite rows (memberships, idempotency keys) | Summary / Pitfalls | Idle never triggers or wrong shutdown |
| A2 | Liveness check combines PID + port connectivity + token match | Stale lock pattern | Rare false stale or false live |
| A3 | `terminate()` on shutdown is acceptable for v1; optional upgrade to close frames later | Code Examples | Clients see abnormal close |

## Open Questions (RESOLVED)

1. **Exact IPC schema** — What fields beyond `port` and `token` (e.g. `dbPath`, `pid`, `version`)?
   - *Recommendation:* Version the message (`v:1`) for forward compatibility (discretion).
   - RESOLVED: Plans use `{ type: "relay.ready", port, token, pid, v: 1 }` — agent's discretion per CONTEXT.

2. **`relay stop` semantics** — SIGTERM to PID from lockfile only, or also port-based discovery?
   - *Recommendation:* PID from lock + fallback to port owner [ASSUMED].
   - RESOLVED: Plan 03-02 implements `stopRelay()` using PID from lockfile. Port-based discovery is not needed for v1.

3. **Windows** — Full support in v1 or document Unix-first?
   - *Recommendation:* Use `env-paths` and test `fork`/`kill` behavior early if Windows is in scope [ASSUMED].
   - RESOLVED: Unix-first for v1. `env-paths` handles platform data dirs. Windows signal/fork behavior is a known risk but not blocking for initial release.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | fork, npm | ✓ | v22.14.0 (probe host) | Minimum `>=20` per repo `package.json` |
| npm | install/npx | ✓ | 10.9.2 | — |

**Missing dependencies with no fallback:** None for core design (pure Node + existing packages).

## Security Domain

Applicable to local-first daemon + CLI (no `security_enforcement: false` in `.planning/config.json`).

### Applicable ASVS-oriented controls

| Category | Applies | Standard control |
|----------|---------|------------------|
| V5 Input Validation | yes | Validate IPC messages and CLI args; reject unexpected shapes |
| V4 Access Control | partial | Loopback bind [CITED: `LISTEN_HOST` in relay]; lockfile in user-owned dir only |
| V6 Cryptography | optional | Generation token from `crypto.randomBytes` [ASSUMED: 128+ bits] |

### Threat patterns

| Pattern | Mitigation |
|---------|------------|
| Malicious local user replacing lockfile | Same trust model as SQLite file; user-scoped directory permissions |
| CLI command injection | Use `commander`; avoid `shell: true` spawn |

## Sources

### Primary (HIGH confidence)

- `03-CONTEXT.md` — locked spawn, lock, idle, paths, shutdown
- `02-CONTEXT.md` — default port **18765**, relay design upstream
- `01-CONTEXT.md` — SQLite/migrations, UUID v7 sessions
- [Node.js `child_process` documentation](https://nodejs.org/api/child_process.html) — `fork`, `detached`, `disconnect`, IPC
- `packages/relay/src/server.ts` — `createRelayServer`, `DEFAULT_RELAY_PORT`, `LISTEN_HOST`, `close`

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — CP1–CP3, CP5
- `.planning/research/ARCHITECTURE.md` — supervisor role, idle shutdown outline
- `.cursor/rules/gsd-context.md` — product constraints (note stack vs CONTEXT divergence on fork)

### Tertiary (LOW confidence)

- npm registry views for `commander`, `env-paths`, `proper-lockfile`, `execa` (versions only)

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — CONTEXT + npm verify + Node docs  
- Architecture: **HIGH** — aligns with existing relay code and ARCHITECTURE.md  
- Pitfalls: **MEDIUM** — idle/stale-lock edge cases need PLAN-level test cases  

**Research date:** 2026-04-13  
**Valid until:** ~30 days (stable domain) or until Phase 2 implementation changes `createRelayServer` contract
