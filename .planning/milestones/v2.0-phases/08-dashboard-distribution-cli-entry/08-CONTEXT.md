# Phase 8: Dashboard distribution & CLI entry - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators install once and open the dashboard from the CLI with production same-origin static hosting. The relay serves built dashboard assets on the same origin as its WebSocket upgrade endpoint. A new `talkie dashboard` CLI command ensures the relay is running, opens the browser, and prints the URL. No new UI components beyond the existing connection shell — roster, transcript, and controls belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### URL Path Design
- **D-01:** Dashboard is served under `/dashboard` prefix — e.g. `http://127.0.0.1:18765/dashboard`. Short, memorable, leaves root path available for future use.
- **D-02:** Existing API routes (`/__agent-talkie/v1/health`, WebSocket upgrade) continue unchanged under their current paths. No collision with dashboard paths.
- **D-03:** SPA fallback: any request under `/dashboard` that doesn't match a static file returns `index.html` so client-side routing works if added later.

### CLI `talkie dashboard` Behavior
- **D-04:** Command auto-opens the default browser AND prints the URL to stdout.
- **D-05:** Command ensures relay is running first (via `ensureRelayRunning` from supervisor). If relay is already running, reuse it.
- **D-06:** Command is non-blocking — prints URL, opens browser, exits. The relay continues running as a daemon (existing lifecycle).

### Agent's Discretion
- Static file serving middleware choice (sirv, hand-rolled, or other lightweight option compatible with raw `http.createServer()`)
- Vite build configuration changes: how to produce `index.html` + bundled assets for production while preserving existing bridge/component exports
- Asset path resolution at runtime: how the relay package locates `@agent-talkie/dashboard/dist` (require.resolve, relative path, or package exports field)
- Whether to add a `--no-open` flag for CI/headless environments (recommended but agent's call)
- Build integration: whether CI/monorepo builds dashboard before relay, or relay's build script triggers dashboard build

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Relay Server (static serving must integrate here)
- `packages/relay/src/server.ts` — HTTP server creation, health endpoint handler, WebSocket upgrade. Static serving middleware hooks into this server's request handler.
- `packages/relay/src/daemon.ts` — Daemon lifecycle, lock file, port/generation management. `talkie dashboard` reads lock file for port discovery.

### Dashboard Package (build source)
- `packages/dashboard/vite.config.ts` — Current Vite config (lib mode). Needs app-mode build producing `index.html` + assets.
- `packages/dashboard/index.html` — App entry HTML template.
- `packages/dashboard/package.json` — Build scripts, dependencies (Lit, Vite, Zod).

### CLI (new command target)
- `packages/cli/src/cli.ts` — Commander-based CLI. New `talkie dashboard` command goes here.
- `packages/supervisor/src/ensure-relay.ts` — `ensureRelayRunning()` returns `{ port, generation, pid }`.

### Phase 7 Context (predecessor decisions)
- `.planning/phases/07-browser-connection-session-bridge/07-CONTEXT.md` — Browser session bridge architecture, connection health UX, reconnect strategy.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ensureRelayRunning()` from `@agent-talkie/supervisor`: Already handles relay startup, lock file, port discovery — CLI command reuses this directly.
- `http.createServer()` in `server.ts`: Relay already has an HTTP request handler for the health endpoint. Static serving hooks into the same handler.
- Vite config with proxy: Dev mode already proxies `/__agent-talkie` to the relay, so dev workflow is established.

### Established Patterns
- Relay uses raw `http.createServer()` — no Express. Static file middleware must work with Node.js native `http.IncomingMessage/ServerResponse`.
- Daemon lock file (`relay.lock`) contains `{ pid, port, generation }` — the CLI can read this to discover the relay URL without re-starting.
- Monorepo workspace: `npm run build -w @agent-talkie/dashboard` already works for building packages in dependency order.

### Integration Points
- `server.ts` request handler: Currently handles only health endpoint + WebSocket upgrade. Static serving adds a new branch for `/dashboard` paths.
- `cli.ts` Commander program: New `program.command("dashboard")` alongside existing `relay`, `ping`, `space`, etc.
- `package.json` files field in relay: May need to include or reference dashboard dist for npm publishing.

</code_context>

<specifics>
## Specific Ideas

- User explicitly dislikes long prefixes like `/__agent-talkie/dashboard/` — keep paths short and natural.
- Dashboard should "just work" with `talkie dashboard` — minimal ceremony.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-dashboard-distribution-cli-entry*
*Context gathered: 2026-04-17*
