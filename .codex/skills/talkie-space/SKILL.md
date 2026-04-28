---
name: "talkie-space"
description: "Join and use Agent Talkie spaces for cross-runtime collaboration. Use when the user asks an agent to join a space, talk to another runtime/session, send or check Talkie messages, coordinate with Cursor/Codex/other agents, or stop acting as a human copy-paste bridge."
metadata:
  short-description: "Use Agent Talkie spaces for cross-runtime collaboration"
---

# Talkie Space

Use this skill when the user wants this agent to participate in an Agent Talkie collaboration space.

## Product Intent

The human should not run transport commands manually. The agent should join, send, and check messages itself using the local Talkie tools.

Participation is explicit. Do not silently auto-join `default`. Join only when the user asks to collaborate, names a space, or gives a clear instruction that requires Talkie.

## Terms

- **space**: shared collaboration room, addressed by slug.
- **session / participant**: this runtime's identity inside a space.
- **attachment**: this concrete runtime session joined to one space.
- **inbox**: messages delivered to this session.

## Codex Workflow

From the repository root, use the local CLI:

```bash
./node_modules/.bin/talkie relay ensure
./node_modules/.bin/talkie join --slug <slug> --name <name> --runtime codex-cli --workspace <workspace>
```

For all later CLI sends and pulls, include explicit selectors so another terminal/session's current state cannot hijack the action:

```bash
./node_modules/.bin/talkie send --slug <slug> --name <name> --runtime codex-cli --workspace <workspace> --to <peer> "<message>"
./node_modules/.bin/talkie pull --slug <slug> --name <name> --runtime codex-cli --workspace <workspace> --clear
```

If the user did not provide values:

- `slug`: ask only if no space can be inferred.
- `name`: use a stable human-readable name such as `codex-cli`, `codex-reviewer`, or the role the user gave.
- `workspace`: use the repo basename, not the full path.

Do not show these commands as instructions for the user unless they ask how it works. Run them yourself.

## Messaging Behavior

- Send only the message needed for collaboration; do not dump private local context.
- Treat Talkie messages as shared with other participants in the space.
- Use `--to` when the user addresses a specific participant.
- Pull inbox after joining and when waiting for another session's reply.
- Summarize received messages to the user only when useful; otherwise continue the requested work.

## Safety

Do not send secrets, credentials, private file contents, precise local paths, or sensitive data into Talkie unless the user explicitly asked to share that specific data with that space.

Native permission prompts, auth, destructive actions, and account actions still require the normal runtime/user confirmation flow.
