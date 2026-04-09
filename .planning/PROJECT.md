# agent-talkie

## What This Is

A collaboration layer that connects independently running coding agent sessions across different runtimes (Cursor, Claude Code, Codex, etc.) into a shared collaboration space. Instead of forcing the human to copy-paste between tools, sessions talk directly, coordinate through an orchestrator, and resolve questions peer-to-peer.

## Core Value

Running agent sessions can collaborate directly across runtime boundaries without the human acting as a copy-paste bridge.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- Named sessions with stable identity, runtime context, and workspace awareness
- Shared collaboration spaces where multiple sessions participate
- Direct session-to-session messaging across runtimes
- Orchestrator role that receives default human input and coordinates work
- Multi-turn conversation support (not just one-shot dispatch)
- Peer-first question resolution before human escalation
- Collaboration metadata managed by the collaboration layer (role, progress, focus)
- Human-visible surface for oversight and intervention
- Explicit opt-in participation (slash command or attach flow)
- Multiple humans with their own local sessions in the same space
- Local context stays local — collaboration layer coordinates, not absorbs
- Workspace awareness sufficient for meaningful collaboration

### Out of Scope

- Generic multi-agent git conflict resolution — not a version control tool
- Hosted autonomous agent platform — sessions run in existing runtimes
- Persistent memory platform for agents — out of product boundary
- Replace native client approval/auth/prompt UX — native interruptions stay native
- Full replacement of any runtime's internal task/subagent system — interoperability, not replacement
- General-purpose harness framework — tool layer first, harnesses are secondary
- Centralize all local context into one hosted system — local-first trust model

## Context

The problem is not agent quality. The problem is that each runtime keeps its strengths inside its own product boundary. Different runtimes are good at different things — implementation, review, exploration — but they cannot talk to each other. The human becomes the bridge, relaying context, tracking who is blocked, and repeating information.

This applies at the individual level (one person using several tools) and at the team level (multiple people, each with their own agent sessions, needing to coordinate on cross-team features).

The product pattern is: a set of concrete running sessions, a shared collaboration space, explicit routing between sessions, an orchestrator role when coordination is needed, and a human-visible surface for oversight.

**Design principles:**

- Session first (unit of collaboration is a session, not a runtime brand)
- Conversation first (optimize for ongoing back-and-forth, not one-way delegation)
- Existing runtime first (connect sessions users already run, no hosted execution required)
- Bring your own agents (works for teams, each participant brings their own local sessions)
- Humans are not middleware (supervise and guide, don't shuttle information)
- Peer resolution before human escalation
- Orchestrator as control point (owns outcome, drives momentum, consolidates questions)
- Collaboration metadata belongs to the collaboration layer
- Local context stays local
- Explicit participation over ambient discovery
- Keep the boundary narrow (solve cross-runtime collaboration, not every multi-agent problem)
- Tool layer first (narrow built-in semantics — message exchange plus collaboration metadata)

## Constraints

- **Architecture**: Must work with existing runtimes without requiring them to change their internal architecture
- **Trust model**: Local-first — local context stays on user's machine unless deliberately shared
- **Participation**: Explicit opt-in required; network presence alone must not grant membership
- **Scope**: Collaboration layer only — no git conflict avoidance, no hosted memory, no runtime replacement

## Key Decisions


| Decision                                                        | Rationale                                                                                        | Outcome   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| Session as unit of collaboration, not runtime brand             | Users may run multiple sessions from the same runtime; addressing by brand is ambiguous          | — Pending |
| Conversation-first over task-first                              | Value appears when sessions keep talking after initial dispatch (clarify, challenge, negotiate)  | — Pending |
| Tool layer with narrow built-in semantics                       | Richer information exchange should happen through harnesses, not platform-native artifact models | — Pending |
| Collaboration metadata in collaboration layer, not worker repos | Role, progress, focus exist to make work legible to other sessions and the human                 | — Pending |


## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-04-09 after initialization*