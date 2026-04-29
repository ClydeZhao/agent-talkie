# agent-talkie 里程碑

状态：当前基线  
最后更新：2026-04-28

这份文档跟踪产品交付顺序。`PRD.md` 定义长期产品模式，`docs/architecture.md` 定义实现架构和不变量，具体当前里程碑定义放在 `docs/milestones/`。

## 当前里程碑：v3.0 Local Orchestrated Product

目标：交付一个可以给用户日常使用的单机版产品形态。用户可以在一个 runtime 里创建 Talkie Space，在另一个 runtime 里显式加入，并通过 orchestrator-first 的 IM 风格 dashboard 监督协作。

详细定义：`docs/milestones/v3-local-orchestrated-product.md`

执行计划：`docs/milestones/v3-local-orchestrated-product-plan.md`

范围：

- Codex App、Codex CLI、Cursor App 在同一台机器上的协作
- runtime-native create/join flow，而不是让用户手跑 `join/send/pull`
- dashboard 打开后显示可复制的 join prompt
- dashboard 默认显示 Human ↔ Orchestrator discussion
- participant private chat 作为微操/介入路径
- active/idle/archived/destroyed space lifecycle
- 干净的 human/session/participant lifecycle
- relay lifecycle 可见、可恢复
- setup diagnostics 和真实本地 UAT

明确不做：

- 多机、多人、远程 relay trust
- TLS、tunnel、access token 或跨网络 invite
- hosted execution
- 通用项目管理 harness
- 集中化各 runtime 的私有上下文

## 已交付基线

### v2.0 Web Dashboard

状态：已交付，2026-04-22

核心结果：

- `@agent-talkie/dashboard` 已接入 relay WebSocket，并支持 health、reconnect、catch-up、space picker、roster、transcript、search/filter 和 dashboard send。
- relay 可在生产路径同源托管 dashboard。
- `talkie dashboard` 可以确保本地 relay 并打开 dashboard。
- dashboard 能创建/销毁 space、移除成员、指定/清除 orchestrator，并展示协作 metadata、blocked/attention 状态和 relay error。

遗留问题：

- dashboard 仍偏 relay/debug console，不像面向用户的 orchestrator-first 控制台。
- transcript 默认暴露 raw JSON，普通用户不可读。
- dashboard reload 和 browser tab 生命周期会制造重复或 stale human participant。
- dashboard invite/create/join flow 还不是 runtime-native 产品流程。

### v1.0 MVP

状态：已交付，2026-04-15，2026-04-17 稳定化

核心结果：

- versioned message envelope、Zod validation、JSON Schema export、handshake 版本协商。
- SQLite persistence：sessions、spaces、memberships、transcript、idempotency、collaboration metadata。
- WebSocket relay：join/leave、direct routing、multi-turn conversation、catch-up、idempotency、membership gating。
- supervisor daemon lifecycle：本地 relay 可自动启动，生命周期不依赖第一个 participant。
- CLI oversight：status、who、transcript、watch。
- adapter ingress：stdio reference、Codex adapter、Cursor MCP adapter。
- orchestrator routing、metadata.patch、space ownership 和 owner-gated controls。

## 后续里程碑方向

v3.0 完成后，再重新评估是否推进以下方向：

- 多用户、多机器、remote relay 的显式信任与邀请模型
- 团队 bring-your-own-agent 协作空间
- 更丰富的 runtime 集成
- 哪些 harness pattern 应保留为用户定义，哪些应成为产品内建默认

这些方向不能反向污染 v3.0。当前目标是先把单机多 runtime 产品形态做顺。
