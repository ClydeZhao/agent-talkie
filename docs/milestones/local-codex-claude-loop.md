# Milestone: Local Codex CLI + Claude Code Loop

Defined: 2026-05-30
Status: Verified baseline

## Goal

Prove the smallest useful local collaboration loop: Codex CLI and Claude Code join the same local Talkie Space, exchange messages with each other, and leave observable state in the dashboard.

This milestone is intentionally narrower than the previous broad local product plan. It is not an execution pipeline, a task checklist, or a general project-management harness. It is the proven baseline for the core claim: two real native runtimes can collaborate through Talkie without the human acting as message relay.

## Product Shape

The user should be able to start from a normal local development setup:

- one Codex CLI live sidecar session
- one Claude Code session
- one local Talkie relay
- one dashboard tab used for observation and intervention

Both runtime sessions join the same Talkie Space through their own Talkie integration. Codex CLI joins through a long-running `talkie-codex-adapter` sidecar, not by asking the human to run `talkie pull` after every message. After that, either runtime can receive a message, respond, and send a follow-up. The dashboard can show what happened, but the dashboard is not responsible for copying content from one runtime into the other.

## Scope

In scope:

- Codex CLI joining a local Talkie Space as a concrete live sidecar runtime session.
- Claude Code joining the same space through its Talkie MCP/tool surface.
- Direct Codex CLI <-> Claude Code message delivery.
- At least one multi-turn exchange where a runtime receives a follow-up after its initial join.
- Runtime-visible acknowledgement or status updates so the system can tell delivery from silence.
- Dashboard roster and transcript visibility for the same space.
- Dashboard private intervention only as an observation/control surface, not as the normal relay path.
- Clear failure state when a runtime is offline, stale, missing tools, blocked on native Codex auth/permission/model state, or not consuming inbox messages.

Out of scope for this milestone:

- Cursor App in the final acceptance gate.
- Three-runtime orchestration.
- Multi-user or cross-machine spaces.
- Remote trust, tunnels, TLS, invite tokens, or hosted relay.
- General task planning, issue tracking, or project-management semantics.
- Centralizing a runtime's private local context inside Talkie.
- Teaching the user to manually run low-level `join`, `send`, or `pull` commands as the normal Codex CLI collaboration flow. Pull remains a fallback for Codex App or emergency manual operation.

## Acceptance Gate

The gate passes only when the main thread verifies all of the following in the real local environment:

1. Codex CLI live sidecar and Claude Code are both visible as active participants in one Talkie Space.
2. A message sent by Codex CLI is received by Claude Code without the human copying it.
3. Claude Code responds through Talkie, and Codex CLI can receive the response or a follow-up.
4. The reverse direction is also proven: Claude Code can send a message that the Codex CLI sidecar receives and answers without `talkie pull`.
5. The dashboard shows the same participants, transcript, delivery state, and any intervention state for that space.
6. At least one non-happy path is visible and understandable, such as Claude Code tools missing, Codex CLI sidecar stopped, Codex auth/permission failure, stale participant, relay restart, or an inbox that has not been acknowledged.
7. The final demonstration does not depend on the user manually acting as transport by copying one runtime's message into the other.

Package tests, simulated smoke tests, and browser checks are useful supporting evidence, but they do not satisfy this gate by themselves. The product claim is about real Codex CLI and real Claude Code sessions in one local collaboration loop.

## Dashboard Role

Dashboard is an oversight and intervention surface:

- show which runtime sessions are in the space
- show whether they are online, stale, blocked, or silent
- show readable collaboration history
- allow a human to intervene when a runtime needs clarification or native action

Dashboard should not become the normal communication path. If the user has to copy a message from dashboard into Claude Code or Codex CLI to continue the loop, the milestone has not passed.

## What Stays True After This Milestone

The broader product remains a cross-runtime session collaboration layer. This milestone narrows the current proof, not the long-term product boundary.

Cursor App, multi-human collaboration, remote relay trust, and richer orchestration can return after this loop is reliable. They should not be used to postpone the smaller proof that two real local runtimes can already talk.
