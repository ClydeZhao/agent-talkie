---
phase: 06-oversight-cli-resilience-cleanup
verified: 2026-04-15T17:10:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 6：Oversight CLI 韧性与清理 — 验证报告

**阶段目标：** 在全新数据目录上，`who` / `transcript` / `space status` 等监督 CLI 在查询前完成 relay 数据库初始化（目录创建 + 迁移），并移除 CLI 未使用的 `@agent-talkie/protocol` 依赖。

**验证时间：** 2026-04-15T17:10:00Z  
**状态：** `passed`  
**再验证：** 否（无先前 VERIFICATION.md）

## 目标达成情况

### 可观测事实（对照 ROADMAP 成功标准与 PLAN `must_haves`）

| # | 事实 | 状态 | 证据 |
|---|------|------|------|
| 1 | 全新 `AGENT_TALKIE_DATA_DIR` 上 `talkie who --slug <slug>` 不因 `SqliteError: no such table` 崩溃 | ✓ VERIFIED | `openRelayDatabase()` 先 `mkdirSync` 再 `openDatabase` + `migrate`（`packages/cli/src/oversight/db.ts`）；`cli.test.ts` 对 `who` 断言 `stderr` 不含 `SqliteError` / `no such table` |
| 2 | 同一环境下 `talkie transcript` 与 `talkie space status` 行为一致（不触发无表错误，未知 slug 走 `space not found`） | ✓ VERIFIED | 同一测试对 `space status`、`transcript` 重复相同断言；三者均为 `status === 1` 且 `stderr` 含 `space not found: fresh-oversight-slug` |
| 3 | CLI `package.json` 不再声明 `@agent-talkie/protocol` | ✓ VERIFIED | `packages/cli/package.json` 的 `dependencies` 仅含 client / persistence / supervisor / commander；`rg "@agent-talkie/protocol" packages/cli` 无匹配 |
| 4 | 既有 CLI 测试仍通过 | ✓ VERIFIED | `npm run test -w @agent-talkie/cli` 退出码 0（Vitest：2 files / 7 tests passed）；`pretest` 成功构建 persistence → relay → supervisor → cli |
| 5 | 打开 `relay.sqlite` 前已创建数据目录 | ✓ VERIFIED | `db.ts`：`mkdirSync(dataDir, { recursive: true })` 在 `openDatabase(join(dataDir, ...))` 之前 |
| 6 | `migrate()` 在 `openDatabase()` 之后执行，查询前 schema 已就绪 | ✓ VERIFIED | `const db = openDatabase(...); migrate(db); return db` |
| 7 | `pretest` 不构建 `@agent-talkie/protocol`，且 `tsup` `external` 不含该包 | ✓ VERIFIED | `pretest` 以 `persistence` 开头、无 `protocol`；`tsup.config.ts` 的 `external` 无 `@agent-talkie/protocol` |

**得分：** 7/7

### 必要产物（Level 1–2：存在且非占位）

| 产物 | 预期 | 状态 | 说明 |
|------|------|------|------|
| `packages/cli/src/oversight/db.ts` | mkdir + open + migrate | ✓ VERIFIED | `gsd-tools verify artifacts` 通过；实现有实质逻辑 |
| `packages/cli/src/cli.test.ts` | 新鲜目录回归测试 | ✓ VERIFIED | 同上 |
| `packages/cli/package.json` | 无 protocol、pretest 合理 | ✓ VERIFIED | 同上 |
| `packages/cli/tsup.config.ts` | external 与依赖一致 | ✓ VERIFIED | 同上 |

### 关键连线（Level 3：接线）

| 来源 | 目标 | 途径 | 状态 | 说明 |
|------|------|------|------|------|
| `static-commands.ts` | `openRelayDatabase` | 静态监督命令共用 `db.ts` | ✓ WIRED | `gsd-tools verify key-links`（06-01-PLAN）通过；`runWhoCommand` / `runSpaceStatus` / `runTranscriptCommand` 均调用 `openRelayDatabase()` |
| `cli.ts` | `runWhoCommand` 等 | commander 动作 | ✓ WIRED | `cli.ts` import 并 `await` 上述三函数（约 L126–166） |
| `package.json`（pretest） | 可执行的 `npm run test -w @agent-talkie/cli` | pretest 构建链 | ✓ WIRED（人工补证） | `gsd-tools verify key-links`（06-02-PLAN）对「目标字符串 `npm run test...`」报告未在文件内字面匹配，属工具限制；实际执行 `npm run test -w @agent-talkie/cli` 成功，证明 pretest 链路有效 |

### 数据流追踪（Level 4）

| 产物 | 数据变量 | 来源 | 是否真实数据 | 状态 |
|------|----------|------|----------------|------|
| `static-commands.ts` | `db` | `openRelayDatabase()` → `migrate(db)` 后的 SQLite | 是（迁移后表存在；测试证明查询走业务分支而非缺表） | ✓ FLOWING |

### 行为抽查

| 行为 | 命令 | 结果 | 状态 |
|------|------|------|------|
| CLI 测试套件 | `npm run test -w @agent-talkie/cli` | 退出码 0，7 tests passed | ✓ PASS |
| CLI 构建 | `npm run build -w @agent-talkie/cli` | 退出码 0 | ✓ PASS |

### 需求覆盖（PLAN `requirements` ↔ REQUIREMENTS.md）

| 需求 ID | 来源 PLAN | REQUIREMENTS.md 描述（摘要） | 状态 | 证据 |
|---------|-----------|-------------------------------|------|------|
| **OVER-01** | 06-01-PLAN | Human-visible surface：谁在参与、在做什么、需要关注什么 | ✓ SATISFIED | 监督只读命令在「从未启动 relay」的目录上可安全查库并给出明确错误（`space not found`），不再因未初始化 schema 崩溃，符合监督面可用性缺口关闭 |
| **CLI-03** | 06-01-PLAN、06-02-PLAN | Relay auto-start 对基本本机使用透明，用户不必手动管理 daemon 生命周期 | ✓ SATISFIED（本阶段范围内） | 06-01：`watch` 仍经 `ensureRelayRunning`（`watch.ts`），静态命令采用「只迁移、不擅自启 relay」，与 ROADMAP SC1「迁移或 auto-start」一致；06-02：移除 CLI 对 `protocol` 的多余依赖与 pretest 构建步骤，降低本机 `npm test`/安装路径摩擦，与追溯表中「Phase 6 gap closure」叙述一致 |

**PLAN 声明的需求 ID：** `OVER-01`、`CLI-03` — 均已对应 REQUIREMENTS.md 条目，无遗漏、无「仅在 REQUIREMENTS 映射出现但未列入 PLAN」的孤立项（Phase 6 在追溯表仅关联此两项）。

### 反模式扫描

| 文件 | 严重度 | 说明 |
|------|--------|------|
| — | — | 在 `db.ts`、`static-commands.ts`、`cli.test.ts`、CLI `package.json` / `tsup.config.ts` 中未发现阻断目标的 TODO/FIXME、空实现或「仅 console.log」型占位 |

### 延后项（Step 9b）

当前 roadmap 中 Phase 6 为最后一个阶段，无后续阶段可吸收本阶段缺口；本验证亦未发现需标记为 `deferred` 的失败项。

### 缺口摘要

无。目标与成功标准已由实现与自动测试覆盖。

---

_验证时间：2026-04-15T17:10:00Z_  
_验证者：Claude（gsd-verifier）_
