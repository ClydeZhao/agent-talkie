# @agent-talkie/adapter-cursor-mcp

Cursor MCP adapter for Agent Talkie. It runs as a stdio MCP server, exposes Talkie collaboration tools to Cursor, and provides read-only resources for oversight snapshots.

## Build

From the repository root:

```bash
npm install
npm run build -w @agent-talkie/adapter-cursor-mcp
```

## Cursor configuration

The project-level Cursor config lives at `.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "agent-talkie": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${workspaceFolder}/packages/adapter-cursor-mcp/dist/mcp-server.js"
      ],
      "env": {
        "TALKIE_MCP_DISPLAY_NAME": "cursor-mcp",
        "TALKIE_MCP_RUNTIME": "adapter-cursor-mcp",
        "TALKIE_MCP_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

After changing the config, reload Cursor or refresh MCP servers from Cursor settings.

## Tools

- `join_space` - Join a Talkie space by slug, for example `{ "slug": "phase5-uat" }`.
- `send_message` - Send a conversation message in a joined space.
- `assign_orchestrator` - Designate the orchestrator session. The relay enforces owner authorization.
- `update_metadata` - Patch collaboration profile or status metadata, including blocked-state fields such as `blockedReason`.

## Resources

- `talkie://space/{slug}/participants` - Space summary and active participants.
- `talkie://space/{slug}/timeline` - Recent transcript tail.
- `talkie://space/{slug}/metadata` - Collaboration metadata snapshot.
- `talkie://space/{slug}/blocked` - Sessions self-reporting blocked state.

## Environment

| Variable | Purpose |
|----------|---------|
| `TALKIE_MCP_DISPLAY_NAME` | Display name used for `session.register` |
| `TALKIE_MCP_RUNTIME` | Runtime label, defaults to `adapter-cursor-mcp` |
| `TALKIE_MCP_WORKSPACE` | Workspace label shown in oversight surfaces |
| `TALKIE_MCP_IS_HUMAN` | Set to `0` to register as non-human; defaults to human |

## Local smoke test

Start the relay:

```bash
./node_modules/.bin/talkie relay ensure
```

Use Cursor to call:

```json
{ "slug": "phase5-uat" }
```

Then verify from a terminal:

```bash
./node_modules/.bin/talkie who --slug phase5-uat
./node_modules/.bin/talkie transcript --slug phase5-uat
```
