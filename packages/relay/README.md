# @agent-talkie/relay

WebSocket relay and same-origin dashboard host for local Agent Talkie collaboration.

The relay is the canonical transport. Runtimes and adapters join through the shared protocol; adapter-specific stdio or MCP behavior stays at the edge.

## Local Lifecycle

Most users should not start this package directly. The CLI and adapters call `ensureRelayRunning()` from `@agent-talkie/supervisor`, which starts a local daemon when needed and records liveness in the local data directory.

Useful CLI commands from the repo root:

```bash
./node_modules/.bin/talkie relay ensure
./node_modules/.bin/talkie relay status
./node_modules/.bin/talkie relay stop
./node_modules/.bin/talkie dashboard
```

The daemon stores its SQLite database and lockfile under the platform data directory by default. Set `AGENT_TALKIE_DATA_DIR` to isolate test data.

## Environment

| Variable | Purpose |
|---|---|
| `AGENT_TALKIE_DATA_DIR` | Override relay data directory |
| `AGENT_TALKIE_RELAY_PORT` | Override listen port |
| `AGENT_TALKIE_RELAY_IDLE_MS` | Override idle shutdown timeout for the daemon |
| `AGENT_TALKIE_RECONNECT_PEPPER` | Secret used for reconnect token derivation |

`AGENT_TALKIE_RECONNECT_PEPPER` should be set to a strong secret outside local development. The default development value is not a production secret.

## Verification

```bash
npm run test -w @agent-talkie/relay
```

Run `npm run smoke:local` from the repository root when relay changes affect CLI, adapter, dashboard launch, or cross-runtime behavior.

See `docs/architecture.md` for relay architecture and lifecycle invariants.
