---
phase: 05
slug: cross-runtime-proof-human-oversight
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-15
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Human session → relay control | Any `isHuman` session could previously mutate orchestrator; now bounded by persistent owner identity | Control envelopes (`orchestrator.designate`, `orchestrator.clear`) |
| Codex child process → adapter | Untrusted stdout/stderr parsed as frames/text | Content-Length framed protocol envelopes, raw stderr lines |
| Adapter → relay WebSocket | Envelopes must be protocol-valid | Zod-validated JSON envelopes over loopback WS |
| MCP host → MCP server stdin | Tool inputs are untrusted; must validate with Zod before relay envelopes | JSON-RPC tool call arguments |
| MCP server → SQLite file | Read-only SELECT paths; no migrations from MCP | SQL query results (space summary, transcript, metadata) |
| MCP server → relay WS | Same authorization as any client (`not_space_owner` on designate for non-owners) | Protocol envelopes |
| Operator laptop → relay.sqlite | Local file read; path must match supervisor data dir | SQLite query results for CLI commands |
| Watch WebSocket → relay | Same loopback trust as other clients | Live envelopes for TUI redraw |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Elevation of privilege | `orchestrator.designate` / `orchestrator.clear` in `collaboration-handlers.ts` | mitigate | `envelope.sessionId === getSpaceOwnerSessionId`; claim on first human join; error `not_space_owner` otherwise | closed |
| T-05-02 | Tampering | SQLite `spaces.owner_session_id` | mitigate | Column written only via relay transactions; FK to `sessions(id)` in migration 004 | closed |
| T-05-03 | Repudiation | Owner assignment | accept | Local-first; no external audit requirement at ASVS L1 | closed |
| T-05-04 | Spoofing | Forged Content-Length frames from Codex child | mitigate | `safeParseEnvelope` before `sendEnvelope`; invalid frames dropped | closed |
| T-05-05 | Tampering | Malicious stderr triggers false blocked metadata | accept | Heuristic is advisory; human verifies native UI (D-08); 5s cooldown limits noise | closed |
| T-05-06 | Elevation of privilege | Spawn arbitrary command via adapter | mitigate | Executable from `TALKIE_CODEX_COMMAND` env only (user-controlled); default `codex`; trust boundary documented in README | closed |
| T-05-07 | Tampering | MCP tool `assign_orchestrator` | mitigate | Relay enforces `not_space_owner` gate; Zod validates UUID inputs | closed |
| T-05-08 | Information disclosure | Timeline MCP resource | mitigate | `DEFAULT_TIMELINE_LIMIT = 50` entries; explicit URI fetch (OVER-03 pull model) | closed |
| T-05-09 | Spoofing | Forged MCP payloads | mitigate | `safeParse` / Zod validation + protocol envelope construction; `validation_error` on invalid input | closed |
| T-05-10 | Denial of service | Large `send_message` text via MCP | mitigate | `z.string().max(8000)` on Zod schema | closed |
| T-05-11 | Information disclosure | `talkie transcript` CLI | mitigate | Documented local-only; no network export; help text states "Does not inject messages into agent sessions" | closed |
| T-05-12 | Tampering | SQLite read from swapped file | accept | Local threat model; ASVS L1 scope | closed |
| T-05-13 | Denial of service | Watch tight refresh loop | mitigate | Default refresh 1000ms; `--refresh-ms` clamped 1–60000; exit 1 above max | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-05-03 | Owner assignment has no external audit trail; local-first trust model at ASVS L1 does not require non-repudiation for local daemon operations | Plan author | 2026-04-13 |
| AR-02 | T-05-05 | Stderr blocked heuristic is advisory only; false positives are surfaced to human via native approval UI (D-08); 5s cooldown bounds noise | Plan author | 2026-04-14 |
| AR-03 | T-05-12 | CLI reads whatever SQLite file is at the supervisor data dir; local attacker with filesystem access is out of ASVS L1 scope | Plan author | 2026-04-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Mitigation Evidence

| Threat ID | Evidence File | Pattern Found |
|-----------|---------------|---------------|
| T-05-01 | `packages/relay/src/collaboration-handlers.ts` | `not_space_owner` error + `getSpaceOwnerSessionId` gate |
| T-05-02 | `packages/persistence/migrations/004_space_owner.sql` | `REFERENCES sessions(id)` FK constraint |
| T-05-04 | `packages/adapter-codex/src/codex-bridge.ts` | `safeParseEnvelope` before `sendEnvelope` |
| T-05-06 | `packages/adapter-codex/src/codex-bridge.ts`, `packages/adapter-codex/README.md` | `TALKIE_CODEX_COMMAND` env var; trust boundary documented |
| T-05-07 | `packages/adapter-cursor-mcp/src/mcp-server.ts`, `packages/relay/src/collaboration-handlers.ts` | Zod UUID validation + relay `not_space_owner` enforcement |
| T-05-08 | `packages/adapter-cursor-mcp/src/mcp-server.ts` | `DEFAULT_TIMELINE_LIMIT = 50` |
| T-05-09 | `packages/adapter-cursor-mcp/src/mcp-server.ts` | `safeParse` + `validation_error` response |
| T-05-10 | `packages/adapter-cursor-mcp/src/mcp-server.ts` | `.max(8000)` on send_message text schema |
| T-05-11 | `packages/cli/src/cli.ts` | `Does not inject messages into agent sessions` in help text |
| T-05-13 | `packages/cli/src/cli.ts` | `60000` clamp on `--refresh-ms` |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-15 | 13 | 13 | 0 | gsd-secure-phase (static verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-15
