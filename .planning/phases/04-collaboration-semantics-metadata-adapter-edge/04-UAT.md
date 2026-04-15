---
status: complete
phase: 04-collaboration-semantics-metadata-adapter-edge
source: [.planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-01-SUMMARY.md, .planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-02-SUMMARY.md, .planning/phases/04-collaboration-semantics-metadata-adapter-edge/04-03-SUMMARY.md]
started: 2026-04-15T08:22:33Z
updated: 2026-04-15T08:34:25Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server or service, clear ephemeral state, start the application from scratch, and confirm the server boots without errors, migrations/setup complete, and a primary health check or basic API call returns live data.
result: pass

### 2. Session Human Identity Persistence
expected: Registering a session with isHuman true persists that flag, getSessionById exposes isHuman true, and sessions that omit isHuman default to false.
result: pass

### 3. Human Conversation Default Routing
expected: A human undirected conversation envelope routes to the designated space orchestrator, explicit to routing remains unchanged, and non-human undirected fan-out still reaches other sessions as before.
result: pass

### 4. Missing Orchestrator Errors
expected: A human undirected conversation in a space without an orchestrator receives no_orchestrator, and one whose orchestrator session is offline receives orchestrator_offline.
result: pass

### 5. Orchestrator Designate And Clear Controls
expected: A human can designate and clear the space orchestrator, collaborators receive collaboration.orchestrator updates, repeat designate/clear calls are idempotent, and non-human callers are rejected.
result: pass

### 6. Task Assignment ACL And Delivery
expected: task.assign succeeds only from the current orchestrator, rejected callers receive the ACL error, successful assignments are transcripted, and the task is delivered through the normal envelope path to the target session.
result: pass

### 7. Collaboration Metadata Patch And Query
expected: metadata.patch enforces namespace permissions, profile and status patches merge into the snapshot, collaboration.metadata is broadcast for patches, transcript behavior matches the handler rules, and metadata.query returns the current snapshot without adding a transcript entry.
result: pass

### 8. Shared Session Client Path
expected: TalkieSessionClient completes handshake, sends session.register, resolves the registration response, and then multiplexes incoming envelopes to the caller without breaking the relay protocol shape.
result: pass

### 9. Stdio Adapter Frame Handling
expected: talkie-stdio-adapter accepts valid Content-Length framed UTF-8 JSON envelopes, rejects missing or invalid headers, rejects oversized frames, and reports adapter errors on stderr rather than through relay envelopes.
result: pass

### 10. Stdio Adapter Backpressure
expected: When outbound messages exceed the bounded queue capacity, the adapter drops the oldest queued item, keeps newer items flowing, and emits a structured stderr overflow event without crashing the relay.
result: pass

### 11. Adapter Ingress Documentation
expected: docs/adapter-ingress.md explains the shared client ingress path, the same-transport rule, the stdio reference adapter behavior, and the security constraints without contradicting the implemented packages.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
