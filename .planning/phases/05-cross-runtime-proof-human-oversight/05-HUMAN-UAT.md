---
status: partial
phase: 05-cross-runtime-proof-human-oversight
source: [05-VERIFICATION.md]
started: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Concurrent adapter proof
expected: Run both real adapters (Codex CLI + Cursor MCP) against a live relay. Both register, join the same space, exchange messages. `talkie who` shows both.

result: [pending]

### 2. Live watch split-pane
expected: `talkie watch --slug <s>` shows split layout with participant status table on top and scrolling timeline on bottom. Attention labels update with real traffic.

result: [pending]

### 3. Static CLI commands
expected: `talkie space status`, `talkie transcript`, `talkie who` produce correct output against a populated relay.sqlite.

result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
