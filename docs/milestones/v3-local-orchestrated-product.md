# Milestone: v3.0 Local Orchestrated Product

Defined: 2026-04-28
Status: Planned
Plan: `docs/milestones/v3-local-orchestrated-product-plan.md`

## Goal

Deliver a single-machine product shape where a user can create a Talkie Space from one running runtime, have other local runtimes explicitly join it, and supervise collaboration through an orchestrator-first IM-style dashboard.

The milestone is not trying to complete the full PRD. Team-level, multi-machine, remote trust, hosted relay, and autonomous organization-wide collaboration remain out of scope.

The target user has Codex App, Codex CLI, and Cursor App on one machine and wants them to collaborate today without manually acting as the message relay.

## Product Intent

The local product should feel like this:

> I am talking to the team lead. The lead coordinates the other runtimes. I can open a private chat with any participant when I need to intervene.

The user should not need to understand:

- relay daemon lifecycle
- envelope JSON
- session ids
- routing fields
- transcript catch-up
- whether a runtime joins through CLI, MCP, or a skill

## Scope

In scope:

- localhost relay only
- Codex App, Codex CLI, and Cursor App as target runtimes
- create a Talkie Space from a runtime without requiring a name
- creating runtime becomes orchestrator by default unless the user chooses otherwise
- other runtimes join explicitly through a pasted prompt or active-space selection
- dashboard opens or focuses for the created space
- dashboard defaults to Human ↔ Orchestrator discussion
- participant private chats for intervention
- IM-style conversation presentation
- active, idle, archived, and destroyed local space lifecycle
- clean participant lifecycle so stale browser/runtime sessions do not look active
- relay lifecycle visibility and basic controls
- one-command local installer for CLI, runtime-facing skills, Cursor MCP config, and setup diagnostics
- setup diagnostics for local readiness

Out of scope:

- cross-machine trust, TLS, tunnels, or auth tokens
- hosted relay or hosted execution
- invite-based remote membership
- full autonomous project-management behavior
- centralizing private native runtime context
- turning Talkie into a general-purpose harness framework
- multi-space UX for one runtime-facing session; v3 optimizes one active space per session

## Requirements

### Creation And Joining

- [ ] **LOP-01**: A user can ask a running agent runtime to create a Talkie Space without naming it.
- [ ] **LOP-02**: The creating runtime joins the new space and becomes orchestrator by default unless the user explicitly chooses otherwise.
- [ ] **LOP-03**: Creating a space opens or focuses the dashboard for that space.
- [ ] **LOP-04**: The dashboard shows a copyable join prompt intended for pasting into another runtime.
- [ ] **LOP-05**: A runtime can join from a pasted prompt without the user manually running transport commands.
- [ ] **LOP-06**: If no prompt is provided, a runtime can list active local spaces and use its native question/choice mechanism to ask which one to join.

### Active Space Lifecycle

- [ ] **LOP-07**: Spaces have explicit local lifecycle states: active, idle, archived, destroyed.
- [ ] **LOP-08**: Active-space lists hide archived and destroyed spaces by default.
- [ ] **LOP-09**: Users can archive or destroy spaces from the dashboard.
- [ ] **LOP-10**: Stale empty spaces can be auto-archived by local policy without deleting transcript history.

### Participant Lifecycle

- [ ] **LOP-11**: Dashboard human identity is stable across reloads and does not create duplicate `Human-N` participants for the same local user/tab lifecycle.
- [ ] **LOP-12**: Runtime connections show online, offline, and stale states accurately.
- [ ] **LOP-13**: Stale participants do not appear as active collaborators and can be cleared or archived from the dashboard.
- [ ] **LOP-14**: Relay lifecycle is visible and controllable from the dashboard, including running state, connection count, and stop/restart actions.

### Orchestrated Dashboard UX

- [ ] **LOP-15**: Dashboard default view is the Human ↔ Orchestrator discussion for the current space.
- [ ] **LOP-16**: The message composer in the default view sends to the orchestrator without showing routing controls.
- [ ] **LOP-17**: Participants are shown as team members with role, runtime, workspace, status, and last activity.
- [ ] **LOP-18**: Clicking a participant opens a private chat with that participant.
- [ ] **LOP-19**: Private chats are clearly distinct from the orchestrator discussion and can be used for human intervention.
- [ ] **LOP-20**: Participants can send meaningful updates or questions back to the orchestrator after private intervention.

### Conversation Presentation

- [ ] **LOP-21**: Dashboard shows messages in an IM-style layout rather than raw JSON transcript rows.
- [ ] **LOP-22**: System events such as join, leave, archive, orchestrator change, and blocked state render as lightweight event rows.
- [ ] **LOP-23**: Raw envelope JSON and diagnostics are available in an explicit debug view, not the default view.
- [ ] **LOP-24**: Direct/private messages, orchestrator discussion, and session-to-session messages remain distinguishable without exposing transport fields.

### Agent Runtime Behavior

- [ ] **LOP-25**: Talkie skills and Cursor MCP tools support create-space, list-active-spaces, join-space, send, pull, and acknowledge flows at the product level.
- [ ] **LOP-26**: Joined runtimes can keep checking for pending messages long enough to support natural multi-turn collaboration without repeated human "pull inbox" prompts.
- [ ] **LOP-27**: Runtime-facing prompts use stable human-readable space labels and participant names instead of raw ids unless needed for disambiguation.
- [ ] **LOP-28**: Setup diagnostics can verify that Codex App skills, Codex CLI commands, Cursor MCP config, relay, and dashboard are ready for the local flow.
- [ ] **LOP-29**: A one-command interactive installer can install or update Talkie CLI, runtime-facing skills, Cursor MCP config, and setup diagnostics without requiring the user to understand package layout or low-level config paths.

## Phases

### Phase 13: Local Space Lifecycle And Active List

Goal: establish product-level space lifecycle semantics so new runtime joins can target a short active list instead of raw slugs or stale spaces.

Requirements: LOP-01, LOP-06, LOP-07, LOP-08, LOP-09, LOP-10

Success criteria:

1. A new local space can be created without a user-provided name and receives a human-usable label.
2. Spaces expose active, idle, archived, and destroyed states to CLI, MCP, and dashboard callers.
3. Active-space lists hide archived/destroyed spaces by default and remain short enough for runtime-native selection prompts.
4. Dashboard can archive or destroy spaces and reflects state changes immediately.
5. Empty stale spaces can be auto-archived by policy without deleting transcript data.

Planned slices:

- [ ] 13-01: Persistence and relay lifecycle state
- [ ] 13-02: Active-space list APIs for CLI/MCP/dashboard
- [ ] 13-03: Dashboard archive/destroy controls and stale-space policy

### Phase 14: Runtime Create And Join Flow

Goal: make "create a Talkie Space here" and "join that Talkie Space there" the primary local user flow across Codex App, Codex CLI, and Cursor App.

Requirements: LOP-01, LOP-02, LOP-03, LOP-04, LOP-05, LOP-06, LOP-25, LOP-27

Success criteria:

1. A runtime-facing create flow ensures relay, creates or joins a new space, assigns the creating runtime as orchestrator, and opens/focuses dashboard.
2. Dashboard shows a copyable prompt that another runtime can paste to join the exact space.
3. Cursor MCP and Talkie skills can join from that prompt without the user running CLI transport commands.
4. If the prompt does not identify a space, runtimes can list active spaces and ask the user which one to join.
5. Names shown to the user are stable labels and participant names, not raw ids.

Planned slices:

- [ ] 14-01: CLI product commands for create/list/join prompt flows
- [ ] 14-02: Cursor MCP tools and resources for active spaces and prompt-based join
- [ ] 14-03: Codex/Cursor skill updates for create/join/list behavior

### Phase 15: Clean Participant And Relay Lifecycle

Goal: fix the lifecycle problems that make the local product feel unreliable: duplicate humans, stale participants, and invisible relay daemon state.

Requirements: LOP-11, LOP-12, LOP-13, LOP-14

Success criteria:

1. Reloading or reopening dashboard does not create multiple active human participants for the same local dashboard user.
2. Browser tabs, dashboard user identity, and agent runtime sessions are represented distinctly enough to avoid false `Human-N` noise.
3. Participants show online/offline/stale accurately based on connection and recent heartbeat state.
4. Dashboard can clear stale participants where policy allows.
5. Relay status, connection count, stop, restart, and recovery actions are visible from dashboard.

Planned slices:

- [ ] 15-01: Stable dashboard human identity and connection model
- [ ] 15-02: Participant heartbeat / presence state
- [ ] 15-03: Relay controls and stale participant cleanup UI

### Phase 16: Orchestrator-First Dashboard

Goal: replace the current routing-oriented dashboard interaction with a control-room dashboard centered on the Human ↔ Orchestrator discussion.

Requirements: LOP-15, LOP-16, LOP-17, LOP-18, LOP-19, LOP-20

Success criteria:

1. The default dashboard view is the orchestrator discussion.
2. The composer sends to the orchestrator without exposing `To:` routing controls.
3. Participants are secondary team members with clear role, runtime, workspace, status, last activity, and attention signals.
4. Clicking a participant opens a private chat with that participant.
5. Returning to the orchestrator discussion is obvious and preserves conversation context.
6. Private intervention can result in meaningful status or follow-up messages to the orchestrator.

Planned slices:

- [ ] 16-01: Dashboard information architecture and state model for conversations
- [ ] 16-02: Orchestrator discussion view and simplified composer
- [ ] 16-03: Participant private chat views and role/status controls

### Phase 17: IM-Style Conversation Presentation

Goal: make collaboration history readable by humans by replacing raw transcript rows with chat-style messages and lightweight system events.

Requirements: LOP-21, LOP-22, LOP-23, LOP-24

Success criteria:

1. Human and agent messages render as chat bubbles or message rows with sender, time, and readable body text.
2. System events render as lightweight timeline rows.
3. Raw JSON is hidden behind an explicit diagnostics/debug view.
4. Orchestrator discussion, private chats, and session-to-session messages are distinguishable without exposing envelope fields.
5. Existing transcript search/filter continues to work on readable message text.

Planned slices:

- [ ] 17-01: Message projection layer from envelopes to readable conversation items
- [ ] 17-02: Chat-style renderer and system event rows
- [ ] 17-03: Diagnostics view and search/filter preservation

### Phase 18: Local Product Readiness

Goal: prove the local product can be handed to a user with Codex App, Codex CLI, and Cursor App and used without manual transport commands.

Requirements: LOP-25, LOP-26, LOP-28, LOP-29

Success criteria:

1. Setup diagnostics verify relay, dashboard, Codex skill, Codex CLI command path, Cursor MCP config, and local data dir health.
2. A short install command launches an interactive installer that can install or update the CLI, runtime-facing skills, Cursor MCP config, and doctor entry points.
3. Joined runtimes can continue checking and acknowledging pending messages for natural multi-turn work.
4. A smoke or UAT script verifies the happy path: create space, join another runtime, orchestrator discussion, private chat, lifecycle cleanup.
5. User-facing docs explain install and use without teaching envelope, relay, or transport internals.
6. Temporary/debug artifacts are excluded from normal product commands and docs.

Planned slices:

- [ ] 18-01: Setup doctor and readiness checks
- [ ] 18-02: Runtime message loop / ack behavior for local collaboration
- [ ] 18-03: End-to-end UAT, docs, and cleanup

## Delivery Gate

v3.0 is not complete until a real local UAT proves:

- Codex App, Codex CLI, and Cursor App can all join one local Talkie Space.
- The user creates the space and invites other runtimes without manually running join/send/pull commands.
- Dashboard defaults to orchestrator discussion.
- Participant private chat works.
- The UI does not show raw JSON in the main conversation view.
- Dashboard reload does not create duplicate active humans.
- Relay lifecycle is visible and recoverable.

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| LOP-01 | 13, 14 | Planned |
| LOP-02 | 14 | Planned |
| LOP-03 | 14 | Planned |
| LOP-04 | 14 | Planned |
| LOP-05 | 14 | Planned |
| LOP-06 | 13, 14 | Planned |
| LOP-07 | 13 | Planned |
| LOP-08 | 13 | Planned |
| LOP-09 | 13 | Planned |
| LOP-10 | 13 | Planned |
| LOP-11 | 15 | Planned |
| LOP-12 | 15 | Planned |
| LOP-13 | 15 | Planned |
| LOP-14 | 15 | Planned |
| LOP-15 | 16 | Planned |
| LOP-16 | 16 | Planned |
| LOP-17 | 16 | Planned |
| LOP-18 | 16 | Planned |
| LOP-19 | 16 | Planned |
| LOP-20 | 16 | Planned |
| LOP-21 | 17 | Planned |
| LOP-22 | 17 | Planned |
| LOP-23 | 17 | Planned |
| LOP-24 | 17 | Planned |
| LOP-25 | 14, 18 | Planned |
| LOP-26 | 18 | Planned |
| LOP-27 | 14 | Planned |
| LOP-28 | 18 | Planned |
| LOP-29 | 18 | Planned |
