---
status: complete
phase: 05-cross-runtime-proof-human-oversight
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
started: 2026-04-14T05:17:10Z
updated: 2026-04-15T07:44:43Z
---

## Current Test

[testing complete]

## Tests

### 1. Concurrent Real Adapters
expected: Start the relay and bring up both real adapters (`talkie-codex-adapter` and `talkie-cursor-mcp`) against the same space slug. Both should register and join the same space, `talkie who --slug <slug>` should show both sessions, a cross-adapter message or metadata event should be visible on the other side or in the transcript, and both runtimes should stay connected for at least 60 seconds without repeated protocol errors.
result: pass

### 2. Owner-Gated Orchestrator Control
expected: With two human sessions in the same space, the owner session can manage orchestrator state, but a different human session attempting `orchestrator.designate` or `orchestrator.clear` should receive a `protocol.error` containing `not_space_owner`.
result: pass

### 3. Static Oversight CLI
expected: `talkie space status --slug <slug>` prints pretty JSON including the slug and `ownerSessionId`; `talkie who --slug <slug>` prints the membership table; and `talkie transcript --slug <slug>` returns a valid JSON array from the live `relay.sqlite` without injecting messages into agent sessions.
result: pass

### 4. Live Watch Split-Pane
expected: `talkie watch --slug <slug>` redraws a split terminal view with `PARTICIPANTS` above `TIMELINE`, shows live events from the active space, and updates attention labels as traffic changes.
result: pass

### 5. Native Blocked-State Surfacing
expected: When the Codex runtime hits a native approval or permission prompt, the prompt stays native in Codex, but the oversight layer shows that session as blocked with a non-empty `blockedReason` through `talkie watch`, `talkie space status`, or MCP oversight reads.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
