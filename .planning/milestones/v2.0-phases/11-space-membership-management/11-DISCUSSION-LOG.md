# Phase 11: Space & membership management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 11-space-membership-management
**Areas discussed:** Space creation & destruction, Invite & remove mechanism, Space picker UX

---

## Space Creation

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit create | New relay endpoint/control message, create space without auto-joining | |
| Reuse join (recommended) | User inputs slug, backend reuses space.join logic (create-if-not-exists) | ✓ |
| Agent decides | | |

**User's choice:** Reuse join — consistent with CLI/adapter behavior, no new protocol needed.
**Notes:** None.

---

## Space Destruction Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Owner-only + confirm (recommended) | Only owner can destroy, confirmation dialog, active sessions kicked | ✓ |
| Owner-only no confirm | Same but instant execution, consistent with orchestrator designate/clear | |
| Empty only | Forbid destroying spaces with active members | |
| Agent decides | | |

**User's choice:** Owner-only with confirmation dialog. Active sessions are forcibly removed.
**Notes:** None.

---

## Destroy Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| WS control message (recommended) | New control type "space.destroy", consistent with space.join/leave | ✓ |
| HTTP endpoint | DELETE /__agent-talkie/v1/spaces/{slug}, no WS session needed | |
| Agent decides | | |

**User's choice:** WS control message for consistency.
**Notes:** None.

---

## Invite Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Pull invite (recommended) | Owner sends "membership.invite" targeting sessionId | |
| Request-accept | Invitation with target confirmation | |
| No invite | Sessions join by themselves, dashboard can't know external session IDs | ✓ |

**User's choice:** No invite mechanism. User pointed out that runtime session IDs are not exposed to dashboard users, making targeted invitation impractical. Sessions join by slug via their own adapter/CLI.
**Notes:** "没法邀请吧？runtime 的 session id 默认都是不暴露的，很难拿到。" — This insight narrowed MGMT-02 to remove-only.

---

## Remove (Kick) Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Owner kick (recommended) | Roster action menu "Remove", new membership.remove control message | ✓ |
| Owner kick + confirm | Same but with confirmation dialog | |
| Skip remove | Don't implement kick in v2.0 | |
| Agent decides | | |

**User's choice:** Owner kick without extra confirmation. Immediate execution consistent with Phase 10 orchestrator actions.
**Notes:** None.

---

## Space List API

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP endpoint (recommended) | GET /__agent-talkie/v1/oversight/spaces, returns active spaces | ✓ |
| WS query message | Query via WebSocket control message | |
| Agent decides | | |

**User's choice:** HTTP endpoint for consistency with existing oversight endpoints.
**Notes:** None.

---

## Space Picker Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Header dropdown (recommended) | Header bar shows current slug, click expands dropdown | ✓ |
| Left sidebar top | Space list above roster panel | |
| Agent decides | | |

**User's choice:** Header dropdown.
**Notes:** None.

---

## Space Switch Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| New tab | Clicking a space opens /dashboard?space=<slug> in new tab | ✓ |
| Leave + Re-join | In-tab rebind: leave current, join new, reset store | |
| View-only switch | Switch display without re-joining, join on interaction | |

**User's choice:** New tab. User questioned why the dashboard browser needs its own session at all, then understood the reasoning (sending messages, managing orchestrator). Concluded that "one space = one tab" aligns with Phase 7 D-15 (new tab = new session via sessionStorage).
**Notes:** "切换空间是什么意思？一个 runtime session 切换空间吗？" and "一个 space 不就是一个 tab 吗？为什么切换 tab 还要搞得这么复杂？" — Led to the simplest model: each tab is independent.

---

## Agent's Discretion

- Slug input validation UX
- Confirmation dialog styling
- Dropdown component implementation
- Space list refresh strategy
- Kicked session disconnect experience

## Deferred Ideas

- Invite mechanism — impractical without session discovery API (needs remote relay + auth)
- Multi-space per session — deferred per PROJECT.md (MSPC-01)
- In-tab space switching — skipped for new-tab simplicity
