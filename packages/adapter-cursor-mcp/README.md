# @agent-talkie/adapter-cursor-mcp

Cursor MCP adapter for Agent Talkie. It runs as a stdio MCP server, exposes Talkie collaboration tools to Cursor, and now keeps a session-local inbox for inbound relay messages so Cursor can pull pending work without relying on the human to paste messages across runtimes.

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
        "TALKIE_MCP_WORKSPACE": "${workspaceFolder}",
        "TALKIE_MCP_IS_HUMAN": "0"
      }
    }
  }
}
```

After changing the config, reload Cursor or refresh MCP servers from Cursor settings.

## Tools

- `join_space` - Explicitly join a Talkie space by slug, for example `{ "slug": "phase5-uat", "name": "cursor-reviewer" }`. Each joined slug gets its own space-scoped Talkie identity.
- `send_message` - Send a conversation message by `spaceId` or `slug`, optionally with `toSessionId` for direct routing. The Cursor MCP session must have joined that space first.
- `assign_orchestrator` - Designate the orchestrator session. The relay enforces owner authorization.
- `update_metadata` - Patch collaboration profile or status metadata, including blocked-state fields such as `blockedReason`.
- `pull_inbox` - Return pending inbound Talkie envelopes for this Cursor session; pass `{ "clear": true }` to acknowledge what was returned.

## Resources

- `talkie://session/inbox` - Pending inbound Talkie envelopes for this Cursor session.
- `talkie://session/state` - Session id, joined slugs, cached joined spaces, and pending inbox count.
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
| `TALKIE_MCP_IS_HUMAN` | Set to `0` to register as a peer agent session; defaults to human if unset |

## Codex + Cursor local flow

1. Start the relay:

```bash
./node_modules/.bin/talkie relay ensure
```

2. Start Codex with the same slug:

```bash
TALKIE_CODEX_JOIN_SLUG=default ./node_modules/.bin/talkie-codex-adapter
```

3. Reload Cursor MCP servers, then explicitly join the same slug from Cursor:

```json
{ "slug": "default", "name": "cursor-mcp" }
```

against `join_space`.

4. In Cursor, call:

```json
{ "slug": "default" }
```

against `pull_inbox` to see pending inbound envelopes, or:

```json
{ "slug": "default", "clear": true }
```

to acknowledge what you just pulled.

5. Reply from Cursor with:

```json
{ "slug": "default", "text": "working on it" }
```

against `send_message`.

## Automated local smoke test

This verifies the relay, Codex adapter turn loop, and Cursor MCP inbox/send path without requiring real Codex or Cursor:

```bash
npm run smoke:local
```

The script uses a temporary data directory, starts a local relay, runs a fake Codex process through `talkie-codex-adapter`, starts the Cursor MCP server over stdio, sends a Cursor-style message to Codex, and verifies that Cursor's inbox receives the Codex reply.

## Manual local smoke test

Start the relay:

```bash
./node_modules/.bin/talkie relay ensure
```

Use Cursor to call `join_space`:

```json
{ "slug": "phase5-uat" }
```

Then verify from a terminal:

```bash
./node_modules/.bin/talkie who --slug phase5-uat
./node_modules/.bin/talkie transcript --slug phase5-uat
```
