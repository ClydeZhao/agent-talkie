# Milestone: Local Orchestrator Dashboard

Defined: 2026-05-31
Status: Current target

## Goal

Turn the verified local Codex CLI + Claude Code collaboration loop into a dashboard a human can operate without understanding relay internals.

The product claim for this milestone is not "the relay can move messages." That is already the baseline. The claim is: a human can open one local dashboard, understand who is present, talk to the current orchestrator by default, intervene with a specific runtime when needed, and see whether the system is actually responding.

## Problem

The current dashboard has useful capabilities, but its center of gravity is still a relay/debug console:

- The transcript can expose raw protocol payloads before it explains the collaboration.
- The roster shows sessions, but it does not consistently answer which sessions are reachable, responsible, stale, or waiting for manual pull.
- Send controls do not yet make the default Human -> Orchestrator path feel like the primary product.
- Private intervention exists as a mechanism, but the user still has to reason about runtime delivery details.
- Active spaces can look usable even when the orchestrator is missing, inactive, or unable to consume messages.

That shape is acceptable for debugging the relay. It is not acceptable as the first product surface.

## Product Pattern

The dashboard is a local orchestrator console.

One space has one primary human-facing discussion: Human <-> current Orchestrator. Other participant conversations are secondary intervention paths. The UI should make the current space state legible before it exposes protocol detail.

The dashboard should answer these questions at a glance:

- What space am I in?
- Who is the orchestrator?
- Which runtime sessions are active, stale, blocked, or waiting for manual pull?
- If I type a message now, who receives it?
- Did a runtime receive and respond, or is the system silent?
- When I private-message a participant, is that participant actually able to consume the message?

## User Experience

When the user opens the dashboard for an active local space:

- The header shows the space name, connection state, orchestrator, and whether the space is actionable.
- The main pane shows the readable Human <-> Orchestrator conversation.
- The composer defaults to the orchestrator discussion.
- The participant panel shows runtime sessions with stable human labels, role, runtime, workspace label, availability, last activity, and any blocked reason.
- Selecting a participant opens a private intervention surface, not a second generic transcript dump.
- Sending to an unavailable target is blocked or explicitly marked as queued/manual-pull, never silently accepted as if it were live.
- Raw envelopes and relay diagnostics are available behind an explicit debug affordance.

The user should not have to know envelope fields, relay sequence numbers, session IDs, or low-level routing rules to decide what to do next.

## Frontend Refactor Decision

Yes, the frontend should be refactored for this milestone. It should not be rewritten from scratch, and it should not switch frameworks.

Keep the Lit/Vite dashboard and refactor around product-shaped state:

- Split app composition out of `demo/main.ts` into an explicit dashboard app shell.
- Keep `DashboardStore` as the runtime state owner, but separate relay snapshots from UI selection, composer, and debug state.
- Introduce a conversation projection that turns transcript envelopes into user-facing discussion entries.
- Keep raw transcript payloads in a diagnostics/debug path instead of the default message surface.
- Make participant availability a first-class view model used by roster rows, composer targeting, and private intervention.
- Make invalid states explicit: no orchestrator, stale orchestrator, target offline, target left, target cannot consume inbox, relay disconnected, and browser session recovered after reload.

This is an information-architecture refactor, not a visual repaint. Styling should follow the product shape after the state model is corrected.

## Scope

In scope:

- Orchestrator-first dashboard layout.
- Readable default Human <-> Orchestrator thread.
- Participant panel with actionable runtime availability.
- Private intervention flow for a selected participant.
- Debug drawer or equivalent explicit diagnostics surface.
- Active-space handling that does not present empty, stale, or no-orchestrator spaces as normal active chats.
- Browser session recovery without duplicate active human participants.
- Desktop and mobile responsive layout for the primary dashboard flow.
- Playwright-backed verification for observable dashboard behavior.

Out of scope:

- Cursor App as a final acceptance gate.
- Multi-machine relay, remote trust, TLS, tunnels, or invite tokens.
- Hosted execution or remote agent lifecycle management.
- General task management, issue tracking, milestones, or GSD-style planning semantics inside the product UI.
- A new frontend framework or design system migration.
- Centralizing runtime-private local context in the dashboard.

## Acceptance Gate

This milestone passes only when the main thread verifies all of the following:

1. Opening the dashboard for an active local space shows the current space, orchestrator, connection state, and participant availability without requiring protocol knowledge.
2. A dashboard default message is routed to the active orchestrator, the runtime receives it, the runtime produces a response or status update, and the dashboard observes that result.
3. A private intervention to a selected participant is delivered to that participant, or the UI blocks the send with a clear unavailable/manual-pull state.
4. No-orchestrator, stale-orchestrator, target-offline, and relay-disconnected states are visible and cannot be mistaken for healthy live chat.
5. Reloading the dashboard recovers the browser session without creating duplicate active human participants.
6. Active-space lists mark, hide, or block unusable spaces instead of presenting them as normal chat targets.
7. Raw protocol payloads are not the default transcript surface.
8. Desktop and mobile viewports show the primary flow without overlapping controls, clipped action labels, or unreadable transcript entries.

Package tests are necessary supporting evidence, but they are not enough for this milestone. Because the change is user-visible dashboard behavior, the gate must include Playwright or equivalent browser automation plus a real or scripted runtime receive/respond loop.

## Verification Plan

Minimum verification for implementation:

- `npm run test -w @agent-talkie/dashboard`
- affected package tests for any changed relay, client, protocol, or adapter behavior
- Playwright dashboard flow covering Human -> Orchestrator -> runtime response -> dashboard observation
- Playwright or scripted negative path for at least one unavailable target state
- desktop and mobile screenshot/layout checks for the primary dashboard route
- `npm run smoke:local` when relay, client, CLI, adapter, or dashboard launch behavior changes
- `npm run smoke:codex-claude` before claiming the product loop still works with real local runtime integrations
- `npm run build` before handoff

If implementation only changes documentation, run the documentation validation path from `AGENTS.md` instead.
