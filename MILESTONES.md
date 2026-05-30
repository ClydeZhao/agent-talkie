# agent-talkie 里程碑

状态：当前方向
最后更新：2026-05-31

这份文档只跟踪长期有用的交付方向。`PRD.md` 定义产品模式，`docs/architecture.md` 定义实现架构和不变量，当前交付目标放在 `docs/milestones/`。

## 当前目标：Local Orchestrator Dashboard

目标：把已经验证的 Codex CLI + Claude Code 本地协作闭环产品化成一个人类可直接操作的 orchestrator-first dashboard。用户打开 dashboard 后，应能看懂当前 space、orchestrator、runtime 可用性、默认讨论、private intervention 和失败状态，而不是阅读 relay/debug console。

详细定义：`docs/milestones/local-orchestrator-dashboard.md`

范围：

- dashboard 默认 Human -> Orchestrator 讨论路径清晰、可投递、可观察
- roster 变成 runtime 可用性和介入入口，而不是单纯 session 列表
- private intervention 对选中 participant 可投递，或明确阻止不可响应目标
- transcript 默认可读，raw protocol payload 退到显式 debug affordance
- active-space list 不把空、stale、无 orchestrator 或全员不可响应的 space 呈现成正常可聊
- dashboard reload 不制造重复 active human participant

当前不追：

- Cursor App 进入同一个最终 gate
- 多机、多人、远程 relay trust
- TLS、tunnel、access token 或跨网络 invite
- hosted execution
- 通用项目管理 harness
- 集中化各 runtime 的私有上下文
- 把 dashboard 变成任务管理系统或人工消息搬运台

## 已交付基线

### Codex CLI + Claude Code 最小协作闭环

状态：已验证，2026-05-30

核心结果：

- Codex CLI 和 Claude Code 可以在同一本地 relay 上加入同一个 Talkie Space。
- 两个 runtime 能接收后续消息、回复、ack，并保留自己的原生上下文。
- runtime 之间可以直接讨论；人类不需要手动复制消息充当中转。
- dashboard 可以观察 roster、transcript、orchestrator/default discussion 和 private intervention 的协作状态。
- 失败时能看见 runtime 没有接收、没有回复、离线或需要人工原生处理。

详细定义：`docs/milestones/local-codex-claude-loop.md`

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

Local Orchestrator Dashboard 通过后，再重新评估是否推进以下方向：

- Cursor App 作为第三个本地 runtime 加入同一闭环
- 多用户、多机器、remote relay 的显式信任与邀请模型
- 团队 bring-your-own-agent 协作空间
- 更丰富的 runtime 集成
- 哪些 harness pattern 应保留为用户定义，哪些应成为产品内建默认

这些方向不能反向污染当前目标。现在先把已经验证的本地 runtime loop 变成用户能稳定理解和操作的 dashboard 产品面。
