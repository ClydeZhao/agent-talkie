# Phase 5: Cross-runtime proof & human oversight - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 05-cross-runtime-proof-human-oversight
**Areas discussed:** Second adapter target, Oversight surface, Timeline & blocked-session display, Multi-human participation

---

## Second Adapter Target

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor (MCP tool server) | Cursor supports MCP; an MCP tool server adapter would let a Cursor session join a space and send/receive messages as MCP tool calls | (part of pair) |
| Claude Code (CLI subprocess) | Claude Code runs in a terminal; a CLI-style adapter wraps a subprocess and bridges its stdin/stdout to the relay | |
| Codex CLI (subprocess) | Similar to Claude Code; Codex runs as a CLI agent that could be bridged via subprocess | (part of pair) |
| You decide | Pick whichever two runtimes best prove the cross-runtime concept with least implementation risk | |

**User's choice:** Codex CLI + Cursor MCP as the proof pair. Do not use Claude Code as the second target if the first is already CLI/subprocess-shaped — too similar, weakens the cross-runtime proof.

### Follow-up: MCP Adapter Shape

| Option | Description | Selected |
|--------|-------------|----------|
| MCP tools only | Expose send_message, join_space, check_status etc. as MCP tools that Cursor calls on demand | |
| MCP tools + resources | Tools for actions, plus MCP resources for reading timeline/metadata | ✓ |
| You decide | Pick whichever MCP surface best fits the protocol | |

**User's choice:** MCP tools for mutations (join_space, send_message, assign_orchestrator, update_metadata). MCP resources for read-only state (participant list, timeline, metadata snapshot, blocked-session view). Aligned with MCP's natural split.

---

## Oversight Surface

| Option | Description | Selected |
|--------|-------------|----------|
| CLI subcommands | talkie space status, talkie transcript, talkie who (static snapshot commands) | |
| CLI live watch | talkie watch (live-updating terminal view like htop for sessions) | |
| Both | Static snapshot commands + live watch mode | ✓ |
| You decide | Smallest surface that covers the requirements | |

**User's choice:** Both static snapshot commands and live watch mode. CLI as primary oversight surface, not a web app.

### Follow-up: Watch View Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Participant-centric | Who's in the space, status, blocked state. Messages scroll below. | |
| Timeline-centric | Message stream primary. Participant status in header. | |
| Split view | Top: participant status table. Bottom: scrolling timeline. Both always visible. | ✓ |
| You decide | Whatever makes supervision most effective | |

**User's choice:** Split view — participant status table on top, scrolling timeline on bottom, both always visible.

---

## Timeline & Blocked-Session Display

### Blocked-Session Signal

| Option | Description | Selected |
|--------|-------------|----------|
| Self-reported | Adapter sets progress=blocked via metadata update on native interruption | |
| Inactivity inference | Layer infers blocked from prolonged silence | |
| Self-report primary, inactivity fallback | Adapters report when they can; layer infers when adapter can't | ✓ |
| You decide | | |

**User's choice:** Self-report primary, inactivity inference as fallback. Inferred blocked must be clearly distinguishable from explicitly reported blocked. Silence alone is not definitive proof of native interruption.

### Timeline Observation Model

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only observer | Human watches but messages NOT auto-injected into sessions | |
| Selective injection | Human marks specific messages for injection into sessions | |
| Human as session | Human joins as is_human=true, messages route per protocol, timeline visible via watch/transcript | ✓ |
| You decide | | |

**User's choice:** Human as full session participant (is_human=true). Normal routing rules. Observing timeline does NOT auto-inject all messages into agent context.

---

## Multi-Human Participation

| Option | Description | Selected |
|--------|-------------|----------|
| Equal peers | Any human can join, observe, manage. No hierarchy. | |
| Owner + viewers | One human owns space for management. Others observe and send. | ✓ |
| Equal with shared designate | Any human can designate orchestrator. No ownership. | |
| You decide | | |

**User's choice:** Owner model. One human owns the space for management actions (orchestrator designation, session management). Others join as participants — can observe, send, read timeline, but not manage. Normal participation is broad; control actions are owner-bounded.
**Notes:** User emphasized: "Phase 5 should prove the product, not expand it into a full web app platform. Prefer the smallest oversight surface that still makes timeline, blocked state, and multi-human participation legible."

---

## Agent's Discretion

- Exact MCP tool schemas and resource URI design
- Codex CLI adapter subprocess management
- Live watch terminal rendering approach
- Static CLI command formatting
- Inactivity inference thresholds
- Space ownership assignment mechanism
- Snapshot command names and flags

## Deferred Ideas

None — discussion stayed within phase scope
