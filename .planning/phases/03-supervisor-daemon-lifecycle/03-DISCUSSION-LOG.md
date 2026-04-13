# Phase 3: Supervisor & daemon lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 03-supervisor-daemon-lifecycle
**Areas discussed:** Daemon spawn strategy, Lockfile & single-instance, Idle shutdown
**Areas not selected:** CLI command surface

---

## Daemon Spawn Strategy

**User constraint (provided upfront):** No postinstall persistent background processes. No system-level service managers. Default behavior is on-demand spawn + bounded idle shutdown.

| Option | Description | Selected |
|--------|-------------|----------|
| Client auto-spawns | Client spawns relay automatically when no relay is found | |
| CLI explicit | User must manually start relay first | |
| Both | CLI for manual control, client also auto-spawns if needed | ✓ |

**User's choice:** Both — auto-spawn as default happy path, CLI for inspection/recovery/troubleshooting.
**Notes:** Normal client/session operations auto-spawn the relay if needed. CLI also exposes explicit manual control for start/stop/status/debug.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Detached child_process.spawn | Spawn with detached: true, stdio: ignore, unref() | |
| Fork with IPC | child_process.fork() with IPC handshake to confirm ready | ✓ |
| You decide | Agent picks | |

**User's choice:** Fork with IPC — more reliable readiness detection.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Port probe | Poll port until TCP accepts connections | |
| Lockfile signal | Relay writes lockfile after binding, client watches | |
| Stdout/IPC signal | Relay emits ready message via IPC after binding | ✓ |

**User's choice:** Stdout/IPC signal — relay emits ready via IPC, client reads before detaching.

---

| Option | Description | Selected |
|--------|-------------|----------|
| XDG/platform convention | ~/.local/share/agent-talkie/ on Linux, ~/Library/Application Support/agent-talkie/ on macOS | ✓ |
| Dotdir ~/.agent-talkie/ | Simple cross-platform dotdir | |
| Project-local | .agent-talkie/ in cwd | |
| You decide | Agent picks | |

**User's choice:** XDG/platform convention.

---

## Lockfile & Single-Instance

| Option | Description | Selected |
|--------|-------------|----------|
| PID + port + generation token | Random token on startup; stale = PID dead or token mismatch | ✓ |
| PID + port + startup timestamp | Simpler, stale via PID liveness + age heuristic | |
| You decide | Agent picks | |

**User's choice:** PID + port + generation token — matches RELAY-06 generation token requirement.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-replace | Automatically remove stale lock and spawn new relay | ✓ |
| Warn + manual | Warn user, suggest manual cleanup | |
| Auto-replace + log | Auto-recover with logged warning | |

**User's choice:** Auto-replace, but only after explicit confirmation that the lock is stale. PID dead or generation-token ownership check fails → treat as stale. Conservative checks to avoid deleting a live lock.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same data directory | Inside XDG data dir, consistent with other state | ✓ |
| XDG runtime dir | $XDG_RUNTIME_DIR, ephemeral, auto-cleaned on reboot | |
| You decide | Agent picks | |

**User's choice:** Same data directory.

---

## Idle Shutdown

| Option | Description | Selected |
|--------|-------------|----------|
| Short grace period (30–60s) | Quick cleanup, risk of unnecessary re-spawn | |
| Medium grace period (5 min) | Covers most reconnect gaps | |
| Configurable with default | Default 5 min, override via env/config | ✓ |
| You decide | Agent picks | |

**User's choice:** Configurable with sensible default (5 min).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Active spaces with members | Delay shutdown if disconnected members within session TTL | |
| Nothing extra | No connections = shutdown eligible | ✓ |
| You decide | Agent picks | |

**User's choice:** No connections = shutdown after grace period. SQLite durable state is enough. Reconnecting clients re-spawn and recover from persisted state.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful drain | Stop accepting, close cleanly, flush WAL, exit | ✓ |
| Immediate exit | Close everything fast, SQLite WAL is crash-safe | |
| You decide | Agent picks | |

**User's choice:** Graceful drain on SIGTERM/SIGINT. Keep shutdown bounded, not hang indefinitely.

---

## Agent's Discretion

- CLI command naming and structure
- Exact generation token format
- Exact idle timer env var name and config file format
- Shutdown drain timeout value
- Exact IPC message schema for readiness signal
- npx entrypoint design and package structure

## Deferred Ideas

None — discussion stayed within phase scope
