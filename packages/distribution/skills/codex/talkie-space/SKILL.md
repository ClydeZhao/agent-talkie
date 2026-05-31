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
- Codex CLI live sidecar: `./.agent-talkie/bin/talkie codex start --slug <slug> --name <display-name> --workspace-label <workspace-label>`
- Codex CLI sidecar status: `./.agent-talkie/bin/talkie codex status`
- Codex CLI sidecar stop: `./.agent-talkie/bin/talkie codex stop --slug <slug> --name <display-name> --workspace-label <workspace-label>`
- Pull fallback join: `./.agent-talkie/bin/talkie join-from-prompt --prompt "<paste>" --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label>`
- Send: `./.agent-talkie/bin/talkie send --slug <slug> --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label> "<message>"`
- Pull fallback: `./.agent-talkie/bin/talkie pull --slug <slug> --name <display-name> --runtime <runtime-id> --workspace-label <workspace-label> --clear`

Use a short workspace label such as the repo basename, not the full local path. This label is participant metadata only; it is not the Talkie Space and does not require other runtimes to use the same directory.

When creating a space, give the user the dashboard URL and pasteable join prompt from the JSON output. For Codex CLI, start the live sidecar for the created or joined slug instead of asking the user to manually run `talkie pull`.

Codex CLI live sidecar is the default product flow. It stays connected to the relay, registers with `inboxMode: live`, receives dashboard/default/private/runtime messages automatically, invokes `codex exec --json` or `codex exec --json resume ...`, and writes the Codex reply back into Talkie. It exits automatically when the joined Space is archived/destroyed or its membership is removed, so do not make normal users remember to stop it. Use `talkie codex status` when you need to verify whether the sidecar is running; use `talkie codex stop` only for emergency or debug cleanup.

Pull flow is only a fallback. Use it for Codex App or when the live sidecar cannot run. Codex App remains pull-based/best-effort until there is a stable verified app hook; identify it with `--runtime codex-app` and use `talkie pull --clear` before answering dashboard follow-up messages.

Use the runtime id that matches this actual Codex host. These examples do not
imply that Codex must be orchestrator or that another runtime must be worker.
Orchestrator and worker are collaboration roles, not runtime categories.
