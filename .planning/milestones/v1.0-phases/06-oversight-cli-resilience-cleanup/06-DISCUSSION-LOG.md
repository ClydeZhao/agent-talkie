# Phase 6: Oversight CLI resilience & cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 06-oversight-cli-resilience-cleanup
**Areas discussed:** Database initialization strategy, Dependency cleanup scope

---

## Database Initialization Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| ensureRelayRunning | 启动 relay 后再查询（与 watch 一致，保证 relay 一直在线） | |
| migrate-only | 不启动 relay，仅确保表结构存在然后查询（更轻量，空库返回 'space not found'） | ✓ |
| Agent decides | 按最合适的方式处理 | |

**User's choice:** migrate-only — 只运行 migration 确保表结构存在，不启动 relay 守护进程
**Notes:** 静态快照命令只需要读数据库，不需要 relay 在线。全新数据目录下空库优雅返回 "space not found" 而不是崩溃。

---

## Dependency Cleanup Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 完整清理 | 同时清理 package.json、tsup externals、pretest 脚本中的引用 | ✓ |
| 仅 package.json | 只移除依赖声明，externals 和 pretest 保持不动 | |
| Agent decides | 按最合理的方式清理 | |

**User's choice:** 完整清理 — 从 package.json dependencies、tsup.config.ts externals、pretest 脚本中全部移除
**Notes:** 源码中无实际 import，三处引用都是残留，应一并清理。

## Agent's Discretion

- migrate() 调用的具体位置（openRelayDatabase 内部 vs 每个命令调用点）
- 是否为全新数据目录场景新增测试
- pretest 脚本编辑方式

## Deferred Ideas

None — discussion stayed within phase scope
