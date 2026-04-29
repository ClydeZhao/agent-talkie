# Plan: v3.0 Local Orchestrated Product

Status: Planned
Definition: `docs/milestones/v3-local-orchestrated-product.md`

## Purpose

This plan turns the v3.0 milestone definition into an execution path. The definition states what the local product must become; this file states the build order, package impact, and verification gates.

The plan is intentionally vertical-slice oriented. Each phase should leave the local product more usable, not just move internal abstractions around.

## Execution Principles

1. Product flow first: optimize for "create a space here, join it there, supervise it in the dashboard."
2. Keep relay and persistence as the source of truth. Dashboard and adapters should project product state, not invent it.
3. Do not teach users low-level transport commands as the primary flow. CLI and MCP commands can remain as debug surfaces.
4. Each phase must end with an agent-run end-to-end verification gate. The user should not be the validator for normal phase completion.
5. Preserve the v3 simplification that one runtime-facing session participates in one active space at a time.

## End-To-End Verification Policy

Every phase must include at least one end-to-end scenario that simulates the user-facing workflow affected by that phase.

Use Playwright for browser-observable product behavior: dashboard navigation, active-space lists, archive/destroy controls, join prompt copy, conversation views, private chats, readable message rendering, relay status UI, and responsive layout.

Use Computer Use for real desktop runtime behavior: Codex App, Codex CLI, Cursor App, Cursor MCP tool availability, native prompt/approval behavior, copying a dashboard join prompt into another runtime, and confirming that actual runtimes can complete a collaboration turn.

Do not ask the user to manually validate a phase when Playwright, local smoke, or Computer Use can exercise the workflow. If an E2E gate cannot run in the current environment, the phase must record the blocker and stay incomplete.

Computer Use should be mandatory for phases that change runtime create/join behavior, runtime skills, Cursor MCP integration, or final handoff readiness. For dashboard-only phases, Playwright is the primary E2E tool, with Computer Use added when the change affects the real cross-app operator flow.

## Phase Order

The order is deliberate:

1. Space lifecycle and active list
2. Runtime create and join flow
3. Participant and relay lifecycle cleanup
4. Orchestrator-first dashboard IA
5. IM-style conversation presentation
6. Readiness diagnostics and real local UAT

Space lifecycle comes first because runtime-native join depends on a short active list and stable lifecycle states. Dashboard UX comes after lifecycle cleanup so it does not build a polished surface over duplicate humans and stale participants.

## Phase 13: Local Space Lifecycle And Active List

Goal: make spaces product-level objects with lifecycle state, human-usable labels, and active-list APIs.

Primary packages:

- `@agent-talkie/persistence`
- `@agent-talkie/relay`
- `@agent-talkie/cli`
- `@agent-talkie/adapter-cursor-mcp`
- `@agent-talkie/dashboard`

Implementation slices:

- Add persisted space lifecycle fields for active, idle, archived, and destroyed.
- Add human-usable generated labels separate from low-level slug/id.
- Add repository and relay APIs for create, list active, archive, destroy, and stale-empty auto-archive policy.
- Update CLI and Cursor MCP to expose active-space lists as product-level operations.
- Update dashboard space picker to hide archived/destroyed spaces by default and expose archive/destroy controls.

Verification gate:

- `npm run test -w @agent-talkie/persistence`
- `npm run test -w @agent-talkie/relay`
- `npm run test -w @agent-talkie/cli`
- `npm run test -w @agent-talkie/adapter-cursor-mcp`
- `npm run test -w @agent-talkie/dashboard`
- Playwright check for active list, archive, destroy, and stale-space UI behavior
- Agent-run E2E: create multiple local spaces, archive/destroy one through dashboard, verify another runtime sees only the active list without user validation

## Phase 14: Runtime Create And Join Flow

Goal: make create/join usable from Codex App, Codex CLI, and Cursor App without asking the user to run manual join/send/pull transport commands.

Primary packages and harnesses:

- `@agent-talkie/cli`
- `@agent-talkie/client`
- `@agent-talkie/adapter-cursor-mcp`
- `.codex/skills/talkie-space/SKILL.md`
- `.cursor/skills/talkie-space/SKILL.md`
- `@agent-talkie/dashboard`

Implementation slices:

- Add product commands for create-space, list-active-spaces, join-from-prompt, and dashboard-open/focus.
- Make create-space ensure relay, create or join a generated space, register the creating runtime, assign orchestrator, and open/focus dashboard.
- Add dashboard join prompt generation and copy action.
- Add Cursor MCP tools/resources for active-space selection and prompt-based join.
- Update Codex and Cursor skills so agents run the product flow themselves instead of instructing humans to run low-level commands.

Verification gate:

- `npm run test -w @agent-talkie/client`
- `npm run test -w @agent-talkie/cli`
- `npm run test -w @agent-talkie/adapter-cursor-mcp`
- `npm run test -w @agent-talkie/dashboard`
- `npm run smoke:local`
- Playwright check for dashboard join prompt copy behavior
- Computer Use E2E: create a space from one runtime, copy the dashboard join prompt, paste it into another runtime, join successfully, and complete hello/ack without manual transport commands

## Phase 15: Clean Participant And Relay Lifecycle

Goal: fix duplicate humans, stale participants, and invisible relay daemon state.

Primary packages:

- `@agent-talkie/persistence`
- `@agent-talkie/relay`
- `@agent-talkie/supervisor`
- `@agent-talkie/dashboard`

Implementation slices:

- Introduce stable dashboard human identity across reloads.
- Separate browser tab/connection identity from human participant identity.
- Add heartbeat or last-seen state sufficient to distinguish online, offline, and stale participants.
- Add dashboard controls to clear stale participants where policy allows.
- Expose relay status, connection count, stop, restart, and recovery actions in dashboard.

Verification gate:

- `npm run test -w @agent-talkie/persistence`
- `npm run test -w @agent-talkie/relay`
- `npm run test -w @agent-talkie/supervisor`
- `npm run test -w @agent-talkie/dashboard`
- Playwright check for reload identity stability, stale participant display, and relay controls
- Agent-run E2E: reload dashboard, open/close another dashboard tab, stop/restart relay, and verify participants plus relay state recover without duplicate active humans

## Phase 16: Orchestrator-First Dashboard

Goal: replace routing-oriented dashboard interaction with a Human <-> Orchestrator control surface.

Primary package:

- `@agent-talkie/dashboard`

Implementation slices:

- Add conversation state model for orchestrator discussion, participant private chats, and session-to-session messages.
- Make the default view the Human <-> Orchestrator discussion.
- Remove visible `To:` routing controls from the default composer.
- Make participant roster secondary but actionable: role, runtime, workspace, status, last activity, and attention signals.
- Clicking a participant opens a private chat intervention path.

Verification gate:

- `npm run test -w @agent-talkie/dashboard`
- Playwright checks for default orchestrator discussion, composer routing, participant private chat, and mobile/desktop layout
- Agent-run E2E: create a space with an orchestrator and worker, send the default dashboard message to orchestrator, open a participant private chat, and verify the UI never exposes routing controls in the default path

## Phase 17: IM-Style Conversation Presentation

Goal: make collaboration history readable as conversations and events instead of raw envelope JSON.

Primary packages:

- `@agent-talkie/dashboard`
- `@agent-talkie/protocol` if projection needs shared event typing

Implementation slices:

- Add projection from transcript envelopes to readable conversation items.
- Render human/agent messages as IM-style rows with sender, time, and body.
- Render join, leave, archive, destroy, orchestrator change, and blocked state as lightweight system events.
- Move raw JSON and envelope diagnostics behind an explicit debug view.
- Preserve search/filter behavior over readable message text.

Verification gate:

- `npm run test -w @agent-talkie/dashboard`
- `npm run test -w @agent-talkie/protocol` if shared projection schemas change
- Playwright visual check for readable transcript, diagnostics toggle, search/filter, and layout across desktop/mobile viewports
- Agent-run E2E: generate human, agent, direct/private, session-to-session, and system-event transcript entries, then verify the main view renders readable IM-style conversations while raw JSON stays behind diagnostics

## Phase 18: Local Product Readiness

Goal: prove the product can be handed to a user with Codex App, Codex CLI, and Cursor App.

Primary packages and harnesses:

- `@agent-talkie/cli`
- `@agent-talkie/supervisor`
- `@agent-talkie/adapter-codex`
- `@agent-talkie/adapter-cursor-mcp`
- `@agent-talkie/dashboard`
- `.codex/skills/talkie-space/SKILL.md`
- `.cursor/skills/talkie-space/SKILL.md`

Implementation slices:

- Add setup doctor for relay, dashboard, Codex skill, Codex CLI path, Cursor MCP config, and local data dir health.
- Add a one-command installer flow for Talkie CLI plus runtime-facing skills and Cursor MCP config. The intended primary UX should be a short command such as `npx agent-talkie@latest`, followed by an interactive installer that asks which runtimes and install scope to use. `--global`, `--local`, and runtime flags are optional non-interactive shortcuts for scripts and advanced users, not required primary UX.
- Add or improve runtime message loop/ack behavior so joined runtimes can keep checking pending messages naturally.
- Add final user-facing local flow docs that do not teach envelope, relay, or transport internals.
- Add UAT script/checklist for create space, join another runtime, orchestrator discussion, private chat, and lifecycle cleanup.

Delivery decisions:

- Public npm package name: `agent-talkie`.
- Primary install command: `npx agent-talkie@latest`.
- Package shape: publish a user-facing distribution package named `agent-talkie` that exposes the interactive installer as `agent-talkie` and the day-to-day CLI as `talkie`. Keep existing `@agent-talkie/*` workspace packages as internal implementation boundaries.
- Ownership confirmation: verify the npm name is unclaimed with `npm view agent-talkie`; actually claiming it requires publishing from an authenticated npm account. A placeholder `0.0.0` or first prerelease can reserve the name before broader release.
- Default install UX: interactive. The installer asks which runtimes to configure and whether to install globally or in the current project. `--global`, `--local`, and runtime flags remain optional non-interactive shortcuts.
- Config merge strategy: be conservative and ownership-aware. Preserve user config, write only the Talkie-owned entries, create backups before mutation, and store an install manifest with file paths, versions, and hashes of managed content.
- Cursor MCP config: merge only the `mcpServers.agent-talkie` entry. Do not rewrite unrelated MCP servers. If an existing `agent-talkie` entry differs from the manifest or expected shape, prompt before overwriting.
- Runtime-facing skills: install managed skill directories for Codex and Cursor with version metadata. Update only managed Talkie skill files; leave user-authored skills untouched.
- Update and uninstall: update replaces only managed files/blocks. Uninstall removes only entries and files proven to be installed by Talkie, and leaves user-edited files in place unless the user explicitly confirms removal.

Verification gate:

- `npm test`
- `npm run build`
- `npm run smoke:local`
- Computer Use UAT with Codex App, Codex CLI, and Cursor App all joining one local space and completing hello/ack plus one private-chat intervention

## Cross-Phase Risks

- Dashboard polish before lifecycle cleanup can hide broken identity semantics. Keep Phase 15 before Phase 16.
- Runtime skills can drift from CLI/MCP behavior. Update skills in the same phase as product command changes.
- Active list UX depends on archive/destroy semantics. Do not fake active filtering with ad hoc dashboard-only logic.
- Conversation projection can become a second protocol model. Keep raw envelopes in relay/persistence and project only for UI.
- Computer Use UAT is expensive and brittle. Use it for the final integrated flow, not as a replacement for package tests or Playwright.

## Completion Gate

The milestone can move out of `Planned` only when at least Phase 13 has an executable issue/branch plan or implementation has started.

The milestone can move to `Complete` only when the v3 definition delivery gate passes with real local UAT:

- Codex App, Codex CLI, and Cursor App all join one local Talkie Space.
- The user does not manually run join/send/pull transport commands.
- Dashboard defaults to Human <-> Orchestrator discussion.
- Participant private chat works.
- Main conversation view is readable and does not expose raw JSON.
- Dashboard reload does not create duplicate active humans.
- Relay lifecycle is visible and recoverable.
