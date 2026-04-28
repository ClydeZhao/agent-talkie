---
name: talkie-space
description: "Join and use Agent Talkie spaces for cross-runtime collaboration. Use when the user asks an agent to join a space, talk to another runtime/session, send or check Talkie messages, coordinate with Cursor/Codex/other agents, or stop acting as a human copy-paste bridge."
---

# Talkie Space

Use this skill when the user wants this Cursor agent to participate in an Agent Talkie collaboration space.

## Product Intent

The human should not run transport commands manually. The agent should join, send, and check messages itself using the available Agent Talkie MCP tools.

Participation is explicit. Do not silently auto-join `default`. Join only when the user asks to collaborate, names a space, or gives a clear instruction that requires Talkie.

## Terms

- **space**: shared collaboration room, addressed by slug.
- **session / participant**: this runtime's identity inside a space.
- **attachment**: this concrete Cursor session joined to one space.
- **inbox**: messages delivered to this session.

## Cursor Workflow

Prefer Agent Talkie MCP tools over shell commands:

1. Call `join_space` with:

```json
{ "slug": "<slug>", "name": "<name>" }
```

2. Send messages with:

```json
{ "slug": "<slug>", "text": "<message>" }
```

Use `toSessionId` only when targeting a specific participant by id.

3. Check inbox with:

```json
{ "slug": "<slug>", "clear": true }
```

If the user did not provide values:

- `slug`: ask only if no space can be inferred.
- `name`: use a stable human-readable name such as `cursor-mcp`, `cursor-reviewer`, or the role the user gave.

Do not ask the user to run Talkie commands unless MCP tools are unavailable and shell access is the only fallback.

## Messaging Behavior

- Send only the message needed for collaboration; do not dump private local context.
- Treat Talkie messages as shared with other participants in the space.
- Pull inbox after joining and when waiting for another session's reply.
- Summarize received messages to the user only when useful; otherwise continue the requested work.

## Safety

Do not send secrets, credentials, private file contents, precise local paths, or sensitive data into Talkie unless the user explicitly asked to share that specific data with that space.

Native permission prompts, auth, destructive actions, and account actions still require the normal runtime/user confirmation flow.
