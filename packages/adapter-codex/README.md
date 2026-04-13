# @agent-talkie/adapter-codex

Stdio-side proof adapter for **Codex CLI**: runs the native Codex process as a child, bridges **Content-Length**–framed JSON **both ways** (child stdout → relay; relay → child stdin), and forwards stderr heuristics as collaboration `metadata.patch` when the runtime appears blocked (e.g. approval prompts).

## Trust boundary

The executable is chosen only from **`TALKIE_CODEX_COMMAND`** (default `codex`). That command runs with your user privileges—treat it like any other tool you invoke from a shell.

## Environment

| Variable | Purpose |
|----------|---------|
| `TALKIE_CODEX_COMMAND` | Executable (default `codex`) |
| `TALKIE_CODEX_ARGS_JSON` | Optional JSON array of extra argv strings |
| `TALKIE_CODEX_JOIN_SLUG` | If set, join this space slug after `session.register` |
| `TALKIE_CODEX_SPACE_ID` | If set (UUID) and join slug unset, use this `spaceId` for blocked metadata |
| `TALKIE_CODEX_DISPLAY_NAME` / `TALKIE_CODEX_RUNTIME` / `TALKIE_CODEX_WORKSPACE` | Passed to `session.register` |

## CLI

After build: `talkie-codex-adapter` (see `package.json` `bin`).
