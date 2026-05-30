---
name: talkie-space
description: "Join and use Agent Talkie spaces for cross-runtime collaboration. Use when Cursor should join or coordinate in a local Agent Talkie Space."
---

# Talkie Space

Use this skill when Cursor should join or coordinate in a local Agent Talkie Space.

When running in Cursor with the Agent Talkie MCP tools available, use those
tools. Do not run the Talkie CLI or shell transport commands as a fallback. If
the MCP tools are unavailable, report that as a setup blocker instead of joining
through CLI.

- `create_space` creates a labeled local space, joins Cursor, and returns a dashboard URL plus join prompt.
- `list_active_spaces` lists active and idle local spaces with labels.
- `join_from_prompt` joins from a pasted dashboard prompt.
- `join_space`, `send_message`, and `pull_inbox` are lower-level fallbacks for an already selected space.

For create or join tools, pass `workspaceLabel` when useful, for example `{ "name": "cursor-reviewer", "workspaceLabel": "repo" }`. Use a short workspace label such as the repo basename, not the full local path. This label is participant metadata only; it is not the Talkie Space and does not require other runtimes to use the same directory.

Do not ask the user to run raw transport commands when a product-level create/list/join tool can do the job.

After joining from a prompt, call `pull_inbox` with the joined slug, send a
short hello/ack with `send_message`, and keep using `pull_inbox` with
`clear=true` for dashboard follow-up messages before responding.

Orchestrator and worker are collaboration roles, not runtime categories. Cursor
can be designated as orchestrator or act as a worker if the current task
requires it.
