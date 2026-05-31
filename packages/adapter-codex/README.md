# @agent-talkie/adapter-codex

Machine-interface adapter for **Codex CLI**. It does not bridge interactive stdio. Instead it listens for Talkie conversation messages, runs one Codex turn per inbound message with `codex exec --json` or `codex exec --json ... resume`, parses the JSONL event stream, and relays the final assistant reply back into the same Talkie space.

## Model

- Talkie session registration/resume is persisted in `adapter-codex-session-state.json`.
- The registered Talkie session uses `inboxMode: "live"` and is expected to be shown as available while the sidecar is connected.
- The sidecar follows the joined space lifecycle. It exits when the relay reports that the space was archived/destroyed or that the sidecar membership was removed.
- Codex thread ids are persisted separately in `adapter-codex-thread-state.json`, keyed by Talkie `spaceId`.
- First message seen for a space runs `codex exec --json <prompt>`.
- Later messages for that same space run `codex exec --json ... resume <thread_id> <prompt>`, with extra `TALKIE_CODEX_ARGS_JSON` options placed before the `resume` subcommand.
- The adapter extracts one final assistant reply from `item.completed` events and emits one Talkie `chat.message`.
- Only one Codex run is allowed at a time per persisted Talkie space/thread.

## Blocked and failure handling

- stderr approval/interruption heuristics can still emit Talkie `metadata.patch` with `progress: "blocked"`.
- A nonzero Codex exit alone is treated as a failed turn, not automatically as blocked.
- If Codex already has an active turn for a space, later messages for that same space are rejected with blocked metadata instead of starting an overlapping run.

## Trust boundary

The executable comes from `TALKIE_CODEX_COMMAND` (default `codex`) and runs with your user privileges.

## Environment

| Variable | Purpose |
|----------|---------|
| `TALKIE_CODEX_COMMAND` | Executable (default `codex`) |
| `TALKIE_CODEX_ARGS_JSON` | Optional JSON array of extra `codex exec` argv strings, inserted before `resume` on resumed turns |
| `TALKIE_CODEX_JOIN_SLUG` | If set, join this space slug after `session.register` / `session.resume` |
| `TALKIE_CODEX_SPACE_ID` | Optional compatibility setting; invalid UUID values are ignored when no join slug is used |
| `TALKIE_CODEX_DISPLAY_NAME` / `TALKIE_CODEX_RUNTIME` / `TALKIE_CODEX_WORKSPACE_LABEL` | Passed to `session.register` |

## CLI

After build: `talkie-codex-adapter` (see `package.json` `bin`).

Installed product flow:

```bash
./.agent-talkie/bin/talkie codex start --slug <slug> --name "Codex CLI" --workspace-label <label>
./.agent-talkie/bin/talkie codex status
./.agent-talkie/bin/talkie codex stop --slug <slug> --name "Codex CLI" --workspace-label <label>
```

`talkie codex start` launches the durable wrapper installed at
`.agent-talkie/bin/talkie-codex-adapter`, sets the `TALKIE_CODEX_*` environment
for a `codex-cli` live sidecar, records pid/log/status, and is idempotent for
the same slug/name/workspace label. `talkie codex stop` is for emergency or
debug cleanup; normal space archive/destroy should stop the sidecar
automatically, and `talkie codex status` prunes stale pid records.

## Automated local smoke test

From the repository root:

```bash
npm run smoke:codex-live
```

The smoke uses an isolated temporary data directory, starts the local relay, runs this adapter with a fake Codex child process, sends a dashboard-style default message to the Codex live sidecar, verifies the fake Codex reply in the transcript, verifies reentry blocked metadata, then archives the space and verifies the sidecar exits. It does not require a real Codex install.
