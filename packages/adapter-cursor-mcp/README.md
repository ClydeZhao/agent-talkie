# @agent-talkie/adapter-cursor-mcp

MCP adapter for Agent Talkie. It runs as a stdio MCP server, exposes Talkie collaboration tools to MCP-backed local runtimes, and keeps a session-local inbox for inbound relay messages so a runtime can pull pending work without relying on the human to paste messages across tools.

The package name is still `@agent-talkie/adapter-cursor-mcp` because Cursor was
the first MCP-backed runtime target. The distribution installer also wraps this
server for Claude Code with Claude-specific runtime metadata.

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
        "TALKIE_MCP_WORKSPACE_LABEL": "repo-label",
        "TALKIE_MCP_IS_HUMAN": "0"
      }
    }
  }
}
```

After changing the config, reload Cursor or refresh MCP servers from Cursor settings.

## Tools

- `create_space` - Create a local Talkie Space and join this MCP-backed runtime session. Optional session metadata includes `name`, `runtime`, and `workspaceLabel`.
- `list_active_spaces` - List active and idle local spaces with stable labels and actionability for runtime-native selection, including unavailable spaces and pull-based sessions that need manual inbox pulls.
- `join_from_prompt` - Join a Talkie space from a dashboard join prompt. Optional session metadata includes `name`, `runtime`, and `workspaceLabel`.
- `join_space` - Explicitly join a Talkie space by slug, for example `{ "slug": "debug-uat", "name": "cursor-reviewer", "workspaceLabel": "repo" }`. Each joined slug gets its own space-scoped Talkie identity.
- `send_message` - Send a conversation message by `spaceId` or `slug`, optionally with `toSessionId` for direct routing. The MCP-backed runtime session must have joined that space first.
- `assign_orchestrator` - Designate the orchestrator session. The relay enforces owner authorization.
- `update_metadata` - Patch collaboration profile or status metadata, including blocked-state fields such as `blockedReason`.
- `pull_inbox` - Return pending inbound Talkie envelopes for this MCP-backed runtime session; pass `{ "clear": true }` to acknowledge what was returned. The server also catches up missed direct, effective-orchestrator, or broadcast messages from the persisted transcript when this MCP runtime was offline.

## Resources

- `talkie://session/inbox` - Pending inbound Talkie envelopes for this MCP-backed runtime session, including transcript catch-up items that were missed while the MCP server was offline.
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
| `TALKIE_MCP_STATE_NAMESPACE` | Optional state-file namespace for this MCP server instance; defaults to `TALKIE_MCP_RUNTIME` |
| `TALKIE_MCP_WORKSPACE_LABEL` | Workspace label shown in oversight surfaces |
| `TALKIE_MCP_INBOX_MODE` | Session inbox mode, `pull` by default because MCP-backed runtimes consume Talkie messages through `pull_inbox`; set to `live` only for an adapter that actively consumes pushed messages |
| `TALKIE_MCP_IS_HUMAN` | Set to `0` to register as a peer agent session; defaults to human if unset |

## Current low-level debug flow

This flow is for adapter debugging and smoke testing. It is not the current product gate. The product flow should let one runtime create a Talkie Space, show a dashboard join prompt, and let another runtime join without the user manually running transport commands.

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

## Product direction

The current delivery gate is the Codex CLI + Claude Code minimum collaboration loop. This adapter remains the MCP-backed path for Cursor App and also underpins the Claude Code wrapper, but Cursor App is not part of the current final gate.

The productized local flow remains:

1. A runtime creates a Talkie Space without requiring a manual slug.
2. The creating runtime joins as orchestrator and opens or focuses the dashboard.
3. The dashboard shows a copyable join prompt.
4. Claude Code joins from that prompt or from a short active-space list through its configured MCP tools, using actionability labels to avoid treating unusable spaces as healthy live chats.
5. The user coordinates through the dashboard's Human ↔ Orchestrator discussion, with private participant chats as an intervention path.

For adapter-level verification, use the low-level debug flow above. For automated local coverage of the product path, use `npm run smoke:local`; the current final gate requires real runtime UAT with Codex CLI and Claude Code in one local Talkie Space, with direct message delivery in both directions and dashboard-visible state.

## Automated local smoke test

This verifies the relay, Codex adapter turn loop, and Cursor MCP inbox/send path without requiring real Codex or Cursor:

```bash
npm run smoke:local
```

The script uses a temporary data directory, starts a local relay, runs a fake Codex process through `talkie-codex-adapter`, starts the Cursor MCP server over stdio, sends a Cursor-style message to Codex, and verifies that Cursor's inbox receives the Codex reply.

## Manual low-level smoke test

Start the relay:

```bash
./node_modules/.bin/talkie relay ensure
```

Use Cursor to call `join_space`:

```json
{ "slug": "debug-uat" }
```

Then verify from a terminal:

```bash
./node_modules/.bin/talkie who --slug debug-uat
./node_modules/.bin/talkie transcript --slug debug-uat
```
