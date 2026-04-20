# Phase 10: Interactive human controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 10-interactive-human-controls
**Areas discussed:** Send panel design, Target selection & routing, Orchestrator management UX, Send feedback & retry

---

## Send Panel Design

| Option | Description | Selected |
|--------|-------------|----------|
| 底部输入栏 | 固定在 transcript 下方，类似 Slack/Discord，与 transcript 紧密关联 | ✓ |
| 侧边抽屉 | 点击发送按钮后从右侧滑出，包含目标选择+消息编辑+发送 | |
| 内嵌展开 | transcript 底部有折叠区域，点击展开变成输入区 | |

**User's choice:** 底部输入栏
**Notes:** 符合控制台风格，简单直观

| Option | Description | Selected |
|--------|-------------|----------|
| 单行输入 + Enter 发送 | 类似终端命令行，轻量快速 | |
| 多行文本域 + 发送按钮 | Shift+Enter 换行，Ctrl+Enter 或按钮发送 | ✓ |

**User's choice:** 多行文本域 + 发送按钮

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 conversation | 人类从 dashboard 发送的都是对话消息，控制命令通过专用 UI 触发 | ✓ |
| 两种都支持 + 切换 | 输入栏旁有 conversation/control 切换 | |

**User's choice:** 仅 conversation

---

## Target Selection & Routing

| Option | Description | Selected |
|--------|-------------|----------|
| 默认→orchestrator + roster 点击切换 | 输入栏默认显示「To: Orchestrator」，点击 roster 中某个 session 切换为直接发送目标 | ✓ |
| 输入栏内下拉菜单 | 输入栏左侧有目标下拉，列出 Orchestrator + 所有 session | |
| @mention 系统 | 输入框打 @名字 触发自动完成 | |

**User's choice:** 默认→orchestrator + roster 点击切换
**Notes:** 零额外 UI，复用 roster

| Option | Description | Selected |
|--------|-------------|----------|
| 禁用默认发送 | 输入栏显示「请先指定 orchestrator」提示，只允许直接定向发送 | ✓ |
| 允许尝试 + 失败反馈 | 用户可以发送，失败后 error bar 显示可读错误 | |

**User's choice:** 禁用默认发送
**Notes:** 预防失败，清晰引导

---

## Orchestrator Management UX

| Option | Description | Selected |
|--------|-------------|----------|
| Roster 条目上的 action menu | 点击 roster 中的 session 弹出菜单，包含 designate/clear | ✓ |
| Header 专用按钮 | header 区域有 Orchestrator 状态按钮 | |
| 两者兼有 | header 显示当前状态 + clear，roster 提供 designate | |

**User's choice:** Roster 条目上的 action menu
**Notes:** 操作和目标在同一个位置，直觉

| Option | Description | Selected |
|--------|-------------|----------|
| 隐藏菜单项 | 非 owner 看不到 designate/clear 选项 | ✓ |
| 显示但置灰 | 菜单项可见但不可点 | |

**User's choice:** 隐藏菜单项
**Notes:** 避免无效操作

| Option | Description | Selected |
|--------|-------------|----------|
| 无确认 | 点击即执行，操作可逆 | ✓ |
| 仅 clear 需确认 | designate 直接执行，clear 因为会导致消息无法路由所以确认 | |
| 始终确认 | 两种操作都弹确认框 | |

**User's choice:** 无确认
**Notes:** localhost 场景，操作可逆

---

## Send Feedback & Retry

| Option | Description | Selected |
|--------|-------------|----------|
| 乐观发送 + 失败回退 | 发送后清空输入，消息出现在 transcript。失败通过 error bar 显示 | ✓ |
| 发送中状态 | 消息在 transcript 中显示为"发送中"状态，成功后变正常，失败显示重试按钮 | |

**User's choice:** 乐观发送 + 失败回退
**Notes:** 简单，复用现有 error bar

| Option | Description | Selected |
|--------|-------------|----------|
| 手动重发 | error bar 显示错误后，用户需要重新输入 | |
| Error bar 带重试按钮 | error bar 显示发送失败时附带 Retry 按钮，点击重发相同 envelope（相同 idempotencyKey） | ✓ |
| 输入框回填 + 重试 | 失败后消息回填到输入框，用户可编辑后重发 | |

**User's choice:** Error bar 带重试按钮
**Notes:** 复用现有 error bar + 幂等保证

| Option | Description | Selected |
|--------|-------------|----------|
| 完全隐藏 | 用户不需要知道 idempotencyKey 存在 | ✓ |
| 开发者模式可见 | 正常隐藏，但在详细视图或 tooltip 中可以看到 | |

**User's choice:** 完全隐藏
**Notes:** 幂等是基础设施，不是用户关心的东西

---

## Agent's Discretion

- Send button icon/label design and placement
- Input bar height, max-height, and resize behavior
- Roster action menu trigger mechanism
- Error bar retry button styling
- Keyboard shortcuts beyond Ctrl+Enter
- Target indicator styling and position
- Whether target indicator shows displayName, sessionId prefix, or both

## Deferred Ideas

None — discussion stayed within phase scope
