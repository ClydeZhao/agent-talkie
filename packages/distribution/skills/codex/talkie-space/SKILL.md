---
name: talkie-space
description: "Join and use Agent Talkie spaces for cross-runtime collaboration. Use when Codex should create or join a local Agent Talkie Space, coordinate with another runtime, or exchange messages with another local session."
metadata:
  short-description: "Use Agent Talkie spaces"
---

# Talkie Space

Use this skill when the user asks Codex to create or join a local Agent Talkie Space, coordinate with another runtime, or exchange messages with another local session.

Prefer product commands over low-level transport:

- Runtime id:
  - Codex CLI: `codex-cli`
  - Codex App: `codex-app`
- Create from the current Codex host: `./.agent-talkie/bin/talkie create-space --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label>`
- List: `./.agent-talkie/bin/talkie list-active-spaces`
- Join from a prompt: `./.agent-talkie/bin/talkie join-from-prompt --prompt "<paste>" --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label>`
- Send: `./.agent-talkie/bin/talkie send --slug <slug> --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label> "<message>"`
- Pull: `./.agent-talkie/bin/talkie pull --slug <slug> --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label> --clear`

Use a short workspace label such as the repo basename, not the full local path. This label is participant metadata only; it is not the Talkie Space and does not require other runtimes to use the same directory.

When creating a space, give the user the dashboard URL and pasteable join prompt from the JSON output. When joining from a prompt, do not ask the user to run raw join/send/pull transport commands.

These commands are pull-based session tools. They do not keep Codex CLI attached
or Codex App attached to the relay after the command exits. Codex App uses the
same pull-based command flow as Codex CLI, with `--runtime codex-app`. For
dashboard follow-up messages, run
`talkie pull --clear` yourself and then answer through `talkie send`.

After joining, send a short hello/ack through Talkie and keep checking for
follow-up messages with `talkie pull --clear` for the same slug/name/runtime
before replying in the normal chat.

Use the runtime id that matches this actual Codex host. These examples do not
imply that Codex must be orchestrator or that another runtime must be worker.
Orchestrator and worker are collaboration roles, not runtime categories.
