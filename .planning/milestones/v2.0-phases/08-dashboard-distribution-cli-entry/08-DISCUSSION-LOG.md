# Phase 8: Dashboard distribution & CLI entry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 08-dashboard-distribution-cli-entry
**Areas discussed:** URL path design, CLI behavior

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| 静态资源托管策略 | relay 如何嵌入 dashboard dist？用哪种 Node.js 静态文件中间件？ | |
| Vite 构建模式 | 当前是 lib 模式导出 bridge class，改成 app 模式出 index.html + 产物？ | |
| CLI talkie dashboard 行为 | 自动开浏览器还是打印 URL？是否自动启动 relay？ | |
| URL 路径设计 | dashboard 挂在根路径 / 还是 /__agent-talkie/dashboard/？SPA fallback 策略？ | |

**User's choice:** "你来决定吧，你说的这些我都不懂。但是URL 路径 /__agent-talkie 这个方案不好，好别扭啊，简单一点就行"
**Notes:** User deferred all technical decisions to agent discretion. Expressed strong dislike for verbose URL prefixes — wants simplicity.

---

## URL Path Design

| Option | Description | Selected |
|--------|-------------|----------|
| 根路径 / | 打开 http://127.0.0.1:18765/ 就是 dashboard（最简洁，API 路由继续用已有前缀） | |
| 短前缀 /dashboard | 打开 http://127.0.0.1:18765/dashboard，根路径留给未来用途 | ✓ |

**User's choice:** 短前缀 /dashboard
**Notes:** None

---

## CLI Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 自动开浏览器 + 打印 URL | 最方便 | ✓ |
| 只打印 URL，不自动开浏览器 | | |
| 你来决定 | | |

**User's choice:** 自动开浏览器 + 打印 URL
**Notes:** None

---

## Agent's Discretion

- Static file serving middleware selection (compatible with raw http.createServer)
- Vite build configuration (lib vs app mode, dual entry, asset output)
- Runtime asset path resolution (require.resolve vs relative path)
- Build order and CI integration
- Optional --no-open flag for headless environments

## Deferred Ideas

None
