# agent-talkie PRD

Status: Current  
Last updated: 2026-04-08

A collaboration layer for coding agents that already run in different products.

## Core idea

Most coding agents are strong inside their own product, but isolated outside of it.

You can ask `Codex` to write code, `Claude Code` to review it, and `Cursor` to explore a codebase, but they do not naturally talk to each other. The human becomes the bridge:

- copy a request from one tool into another
- paste the answer back
- relay follow-up questions
- repeat context
- track who is blocked and why

This is wasted work.

`agent-talkie` takes a different approach. Instead of treating each runtime as a separate island, it connects running sessions into a shared collaboration layer. Sessions can talk directly. One session can coordinate. The human can observe and intervene without becoming the transport layer.

This is not another same-runtime subagent or agent-team system. It is an interoperability layer across independently running native sessions.

The pattern works for one person using several tools and extends naturally to a team. Multiple humans can join the same collaboration space, each bringing their own local agent sessions. Those sessions keep their native runtime and local context, but can still collaborate directly.

## Why this matters

The problem is not agent quality. The problem is that each runtime keeps its strengths inside its own product boundary.

Different runtimes are good at different things. A user may prefer one for implementation, another for review, another for exploration. The missing piece is not another model. The missing piece is interoperability.

The same is true at the team level. In an AI-native team, different people will prefer different tools and bring different local agent setups. The product becomes much more powerful when each teammate can bring their own agents into the same collaboration space without surrendering their local runtime or private working context.

This becomes especially painful on company-level features that cross several teams. Product engineers, backend engineers, frontend engineers, infrastructure engineers, and partner teams often need to align on design, negotiate interfaces, coordinate rollout, and run integration work. Today, much of that coordination is still pushed onto humans who manually relay context between tools, teams, and codebases. That is exactly the kind of communication overhead this product should remove.

The product should not try to replace all runtimes with one new super-runtime. It should let existing sessions collaborate while staying where they already are.

## The pattern

The right abstraction is not "one agent per brand." It is not "one task per handoff." It is not "a chat room where everyone sees everything."

It is:

- a set of concrete running sessions
- a shared collaboration space
- explicit routing between sessions
- an orchestrator role when coordination is needed
- a human-visible surface for oversight and intervention

This is conversation-first and task-second.

Tasks still matter. They help organize work. But the value only appears when sessions can keep talking after the initial dispatch:

- asking for context
- challenging a review
- clarifying intent
- negotiating next steps
- unblocking each other

If the system only supports one-shot dispatch, it becomes a weak task queue and loses the point.

## Design principles

### Session first

The unit of collaboration is a session, not a runtime brand.

Users do not collaborate with abstract entities like "Claude" or "Codex". They collaborate with concrete running sessions that have a current workspace, a current task, and a distinct identity.

This matters because users may run several sessions from the same runtime at once.

### Conversation first

The product must optimize for ongoing back-and-forth collaboration, not one-way delegation.

The conversation is not a side effect of the work. The conversation is how the work gets resolved.

### Existing runtime first

`agent-talkie` should connect sessions the user is already running.

It should not require hosted execution, managed ephemeral workspaces, or a new runtime just to make cross-tool collaboration possible.

### Bring your own agents

The product should work for teams, not just solo users.

Each participant should be able to bring their own local agent sessions into the shared collaboration space, regardless of which runtime they use.

### Humans are not middleware

The human should remain in control, but should not be forced to manually shuttle information between agent tools.

The product succeeds when the human can supervise and guide the collaboration without acting as a copy-paste bridge.

### Peer resolution before human escalation

Most questions should be resolved by agents talking to each other first.

Human involvement should happen only when:

- the answer genuinely requires human judgment
- the orchestrator decides escalation is needed
- a native client or tool requires direct human confirmation

### Orchestrator as control point

The orchestrator is not required to relay every message, but it should own the outcome for the collaboration space and proactively drive the team toward it.

Its job is not just to dispatch work. It should keep momentum, follow up on stalled threads, synthesize the current state, and decide when the human needs to step in.

It is the main control point for:

- assigning work
- following up
- deciding when to escalate
- presenting consolidated questions to the human

This keeps the human from being pulled into several raw agent conversations at once.

### Collaboration metadata belongs to the collaboration layer

Role, progress, focus, and other collaboration metadata are not worker-repo artifacts. They belong to the collaboration layer.

They exist to make the work legible to other sessions and to the human.

### Local context stays local

The collaboration layer should not require a user's full local context to be centralized.

The agent keeps its native runtime, tool permissions, and primary working context on the user's own machine. The collaboration layer exists to coordinate, not to absorb all local state into a single system.

### Explicit participation over ambient discovery

Participation should be explicit.

Local sessions owned by the same user may join through a direct in-client action such as a slash command or other explicit attach flow.

Cross-user or cross-machine participation should require an explicit trust mechanism such as an invitation, approval flow, or access token.

Discovery alone, including presence on the same local network, must not grant membership.

### Keep the boundary narrow

`agent-talkie` should solve cross-runtime collaboration, not every multi-agent problem.

It should not try to own:

- git conflict avoidance
- worktree safety
- hosted long-term memory systems
- full replacement of native agent UX

### Tool layer first

`agent-talkie` should focus on the collaboration tool layer: connecting sessions, carrying messages, exposing collaboration metadata, and making coordination legible.

Its built-in semantics should stay narrow. At this layer, the core primitive is message exchange plus collaboration metadata.

Richer information exchange such as code context, diffs, logs, API details, or rollout assumptions should happen through harnesses that guide agents in their native tools rather than through a large platform-native artifact model.

How agents use tools is a harness engineering problem, not the core product problem that `agent-talkie` itself needs to solve.

Harnesses may exist around the product, but they should remain secondary to the collaboration layer rather than becoming a general-purpose product axis.

Whether those harnesses should be primarily user-defined, for example through `AGENTS.md` and skills, or provided as built-in defaults should remain open.

## How collaboration should work

The product should feel like a shared line between otherwise separate agent worlds.

Each running session joins a shared collaboration space. When it joins, it becomes a visible participant with:

- a stable identity
- a human-usable name
- visible runtime and workspace context
- lightweight collaboration metadata

Users should address sessions by name, not by runtime brand.

A human message in the shared space should go to the orchestrator by default. A human should also be able to address a specific session directly. Sessions should be able to talk directly to other sessions in the same space.

The visible collaboration surface is not the same thing as universal agent context. Visibility is broad. Delivery is explicit.

Not every visible message should automatically become context for every session.

At the collaboration-layer level, the platform should carry messages and collaboration metadata. It should not assume that richer information exchange is a first-class built-in product primitive.

A collaboration space may also include several humans, each with their own local sessions. The point is not just "many agents for one person." It is "many humans, each bringing their own agents, still collaborating as one team."

## What a session should expose

Each session should expose enough information to be a useful collaborator:

- who it is
- what runtime it belongs to
- what workspace it is currently operating in
- what role it is playing
- what it is currently focused on
- how its work is progressing

This metadata should be managed by `agent-talkie`, visible in the product, editable by the human when necessary, and updateable by the session itself.

The product should support both automatic and manual ways of keeping this metadata current, but the exact mechanism should remain open.

The important boundary is that collaboration metadata is shared collaboration state. It is not the same thing as exposing a session's entire local context.

## How unblocking should work

There are two fundamentally different kinds of interruption.

The first kind is a knowledge interruption. A session needs context, clarification, or an answer that another session may already have. These should be resolved inside the collaboration layer whenever possible.

The second kind is a native interruption. A runtime or tool needs direct human action, such as:

- permission approval
- authentication
- destructive action confirmation
- runtime-native user-input prompts

These should remain in the native client. `agent-talkie` should make them visible and legible, but should not try to replace them.

This distinction matters because not every interruption should drag the human into the loop.

## Product capabilities

The product should support:

- named sessions, including multiple sessions from the same runtime in one collaboration space
- multiple humans participating in the same collaboration space
- bring-your-own-agent participation, where each human can contribute their own local sessions
- direct cross-runtime session-to-session communication
- an orchestrator role that can receive default human input and coordinate work
- multi-turn conversations, not just one-shot requests
- peer-first question resolution
- orchestrator-mediated human escalation
- visibility into who is participating, what they are doing, and what needs attention
- collaboration metadata that belongs to the collaboration layer rather than the worker workspace
- enough workspace awareness to make collaboration meaningful
- many sessions working in parallel inside the same collaboration space
- explicit opt-in participation for sessions and invite-based channel membership
- a local-first trust model where local context stays on the user's machine unless deliberately shared

## Representative examples

### Cross-runtime review

A human is working with a session named `impl-auth`. They ask it to get a review from `reviewer-1`. `reviewer-1` reviews the work, asks follow-up questions if needed, and returns findings. The two sessions continue discussing until the review is actually resolved.

### Orchestrated multi-session delivery

A session named `lead` acts as orchestrator. It dispatches frontend work to `fe-worker` and backend work to `be-worker`. Those sessions work in parallel, ask each other questions when needed, and `lead` only escalates to the human when necessary.

### Human-in-the-loop unblocking

A worker session needs information. Another session answers, and the worker continues without human help. Later, a different session hits a native permission prompt. The product shows exactly which session needs human attention, and the human goes to that native session to resolve it.

### Cross-team feature delivery

A company is shipping a feature that crosses several teams. One team owns the product surface, another owns the backend service, another owns authentication, and another owns the developer platform or infrastructure needed for rollout. Each team already has local agent sessions working inside its own repo or module.

They join the same feature channel with those sessions. The sessions use the channel to align on the design, clarify ownership boundaries, negotiate interface changes, coordinate implementation order, and prepare integration work. When one team changes an API contract or rollout assumption, the relevant sessions can ask follow-up questions immediately instead of waiting for a human to notice and relay the mismatch.

During integration, the sessions can keep talking across team boundaries: confirming expectations, exchanging the needed code or rollout context through their own tools and harnesses, surfacing blockers, and coordinating fixes. Humans still supervise and make decisions, but they no longer have to serve as the transport layer between teams' agents.

## Non-goals

`agent-talkie` is not meant to:

- solve generic multi-agent git conflicts or worktree collisions
- become a general-purpose harness framework for agent behavior
- replace each runtime's internal task system or subagent system
- become a hosted autonomous agent platform
- become a persistent memory platform for agents
- replace native client approval, auth, or prompt UX
- make every visible channel message implicit context for every session
- centralize every participant's local context into one hosted system

## Default decisions

- Session names should be human-usable labels with stable disambiguation when needed. A name may be chosen by the user or proposed by the session, but the system should add a clear disambiguator when collisions exist, such as runtime, owner, or numeric suffix.
- Workspace visibility should be minimal by default. High-level workspace context such as runtime, repo or workspace label, branch, and current focus may be visible, but local paths and other sensitive details should remain private unless explicitly shared.
- Metadata upkeep should be hybrid by default. Status-like fields such as activity, blocked state, and last update can be refreshed automatically, while semantic fields such as role, display name, ownership, and declared focus should remain under human control.
- Human-visible history should default to the shared collaboration timeline and explicitly shared threads. Internal native context, private local state, and anything not sent into the collaboration layer should not be exposed by default.

## Open questions

- How much harnessing should be built into the product versus supplied by users and repositories through mechanisms such as `AGENTS.md` and skills?
- What should the initial trust and invitation model be for collaboration spaces shared across teammates?
- How should the orchestrator role be assigned, changed, or recovered when the current orchestrator disappears?

## Note

This document is intentionally abstract. It defines the product pattern, not a specific implementation.

The exact architecture, protocol, state handling, metadata update workflow, and adapter design should remain open for now. There are many ways to implement this product well. The job of this document is to make the pattern clear enough that those later decisions can be made coherently.
