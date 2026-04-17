# Phase 9: Core oversight UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 09-core-oversight-ui
**Areas discussed:** Roster, Transcript, Metadata, Errors (all deferred to agent)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Roster 展示风格 | 会话列表用卡片/紧凑列表/侧边栏？每个 session 展示哪些字段？如何区分 orchestrator/人类/agent？ | ✓ |
| Transcript 呈现方式 | 聊天气泡风格还是终端日志风格？每条消息展示什么元数据？catch-up 与实时消息如何区分？ | ✓ |
| Metadata 展示设计 | 协作元数据放在 roster 内联还是独立条带？progress 状态如何可视化？blocked 原因如何浮现？ | ✓ |
| Error 呈现策略 | relay 协议错误如何映射为操作者可读消息？用 toast/内联/专属面板？错误消息持续多久？ | ✓ |

**User's choice:** "UI 参考 OpenClaw 的 dashboard。其他细节你来决定。"
**Notes:** User deferred all implementation decisions to agent with single constraint: follow OpenClaw dashboard as design reference. All four gray areas resolved by agent based on codebase analysis, prior phase decisions, and OpenClaw alignment.

---

## Agent's Discretion

All four areas were fully delegated to the agent:
- Roster: compact card-list in left panel, session type icons, orchestrator badge
- Transcript: terminal-log style, virtualized, live tail with scroll-up indicator
- Metadata: inline chips in roster, progress colored dots, blocked highlight
- Errors: notification strip below header, static error code → message map, auto-dismiss/sticky split

## Deferred Ideas

None — discussion stayed within phase scope
