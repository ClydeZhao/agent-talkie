---
status: awaiting_human_verify
trigger: "relay-daemon-exits-after-cli: relay not listening after talkie dashboard exits"
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T12:00:00Z
---

## Current Focus

hypothesis: (confirmed) Idle shutdown keyed only on WebSockets; optional env `AGENT_TALKIE_RELAY_IDLE_MS=0` caused immediate shutdown after CLI exit.
test: Self-verified: relay + cli vitest; manual `RELAY_IDLE_MS=0` + `dashboard --no-open` then curl → 200, lock present.
expecting: Human confirms real `talkie dashboard` workflow (with browser) on their machine.
next_action: User confirms fixed or reports remaining failure.

## Symptoms

expected: After `talkie dashboard` prints URL and CLI exits, relay keeps listening; URL stays reachable.
actual: Relay stops listening shortly or immediately after CLI exits; URL unreachable.
errors: Silent (connection failure / process gone).
reproduction: Run `talkie dashboard`, wait for CLI exit, open or curl printed URL.
started: After Phase 8 (08-01..08-03).

## Eliminated

- hypothesis: `ensureRelayRunning` fork/unref breaks daemon survival
  evidence: Repro on macOS with default env — after CLI exit, curl `/dashboard` returns 200 and lock PID alive.
  timestamp: 2026-04-17

- hypothesis: `runRelayDaemon` returns and exits process (no open handles)
  evidence: Listening `http.Server` keeps event loop; default-env repro relay stays up.
  timestamp: 2026-04-17

## Evidence

- timestamp: 2026-04-17
  checked: `packages/relay/src/server.ts` idle scheduling
  found: `scheduleIdle()` runs on listen when idle shutdown enabled; only `wss` connection/close touches idle — HTTP `/dashboard` does not call `clearIdle` / `scheduleIdle`.
  implication: Dashboard static traffic does not reset idle grace; zero or short idle can shut down before or between WS activity.

- timestamp: 2026-04-17
  checked: Shell repro `AGENT_TALKIE_RELAY_IDLE_MS=0` + `dashboard --no-open`
  found: Lock removed within ~1s; curl failed; relay PID dead.
  implication: Confirms idle policy can kill daemon immediately after CLI when no WebSocket client is connected.

## Resolution

root_cause: Idle shutdown was driven only by WebSocket client count; HTTP requests (including `/dashboard` assets) did not defer shutdown. Separately, `AGENT_TALKIE_RELAY_IDLE_MS=0` made the post-bind idle timer fire with no time for browser/HTTP to attach after `talkie dashboard` exited.
fix: (1) `server.ts` — on each non-upgrade HTTP request, clear idle and reschedule after `res` finish/close when no WS clients remain. (2) `daemon.ts` — treat parsed idle `0` as default 300000 ms so the forked daemon is not torn down before clients connect.
verification: `npm run test -w @agent-talkie/relay` and `npm run test -w @agent-talkie/cli` pass; manual `AGENT_TALKIE_RELAY_IDLE_MS=0` + `dashboard --no-open` + curl `/dashboard` → 200, lock retained.
files_changed:
  - packages/relay/src/server.ts
  - packages/relay/src/daemon.ts
