# Phase 12: Discovery, topology & attention - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 12-discovery-topology-attention
**Areas discussed:** Transcript 搜索与过滤, 拓扑图可视化, 注意力/阻塞通道, 整体布局集成

---

## Transcript 搜索与过滤

| Option | Description | Selected |
|--------|-------------|----------|
| MiniSearch | 轻量全文检索库（~7KB gzip），支持模糊匹配、前缀搜索、加权字段 | ✓ |
| 原生过滤 | Array.filter + 正则/字符串匹配，零依赖，够用但无模糊匹配和相关性排序 | |
| 你来决定 | Agent discretion | |

**User's choice:** MiniSearch
**Notes:** 用户直接选择 MiniSearch，无需讨论。

| Option | Description | Selected |
|--------|-------------|----------|
| 内嵌过滤栏 | transcript 顶部加搜索框 + 过滤芯片，结果在原位 transcript 中高亮/过滤 | |
| 侧面板 | 点击搜索图标展开右侧搜索面板，结果单独列表展示，点击结果跳转到 transcript 对应位置 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 侧面板
**Notes:** 无额外说明。

| Option | Description | Selected |
|--------|-------------|----------|
| AND 芯片 | 多个过滤条件取交集，芯片可点击移除 | ✓ |
| OR 模式 | 同维度内 OR（多个 sender），跨维度 AND | |
| 你来决定 | Agent discretion | |

**User's choice:** AND 芯片
**Notes:** 无额外说明。

| Option | Description | Selected |
|--------|-------------|----------|
| 覆盖模式 | 侧面板浮在 transcript 上方，不占 transcript 宽度 | |
| 分栏模式 | transcript 压缩宽度，搜索结果占右侧一部分空间，两者并排可见 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 分栏模式
**Notes:** 跟进问题确认面板布局行为。

---

## 拓扑图可视化

| Option | Description | Selected |
|--------|-------------|----------|
| Cytoscape.js | 成熟图库，内置多种布局算法，~170KB gzip | |
| D3 force | D3.js 力导向图，更灵活但需要更多手动工作 | |
| 轻量 Canvas | 自写简单图渲染，轻量但功能有限 | |
| 纯 SVG | 跟 OpenClaw 保持一致，零外部依赖 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 纯 SVG
**Notes:** 用户要求先查看 OpenClaw 的 dashboard 用什么。查证后发现 OpenClaw 使用纯内联 SVG 零依赖。用户选择保持一致。

| Option | Description | Selected |
|--------|-------------|----------|
| 消息流向边 | 每条 envelope 产生 sender→target 边，边粗细反映频率 | ✓ |
| 角色拓扑 | 以角色为中心的星形布局，不追踪具体消息边 | |
| 你来决定 | Agent discretion | |

**User's choice:** 消息流向边

| Option | Description | Selected |
|--------|-------------|----------|
| 实时增量 | 每条新 envelope 即时更新图 | |
| 定期重绘 | 每 N 秒根据累积数据重新计算布局 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 定期重绘

**⚠️ Feature descoped:** 用户在最终确认时决定移除拓扑图功能 — "太复杂了，而且没啥价值"。OVER-05 推迟到未来 milestone。以上拓扑图决策仅作记录，不进入 CONTEXT.md 的活跃决策。

---

## 注意力/阻塞通道

| Option | Description | Selected |
|--------|-------------|----------|
| Roster 内嵌区域 | roster 顶部"需要关注"分区，阻塞 session 突出显示 | ✓ |
| 顶部横幅 | header 下方的注意力横幅，水平展示 session 卡片 | |
| 第三栏 | 右侧新增窄栏专门显示注意力信号 | |
| 你来决定 | Agent discretion | |

**User's choice:** Roster 内嵌区域

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 blocked 状态 | 只有 progress=blocked 的 session 触发 | ✓ |
| blocked + 长时间无活动 | 也浮现超时无消息的 working session | |
| 你来决定 | Agent discretion | |

**User's choice:** 仅 blocked 状态

---

## 整体布局集成

| Option | Description | Selected |
|--------|-------------|----------|
| 左栏 Roster 下方 | 拓扑图在 roster 下半 | |
| 主面板 Tab 切换 | transcript 和拓扑图作为两个 tab | |
| 可折叠头部区域 | 拓扑图在 header 和 body 之间可展开 | |
| 右侧面板 | 独立可开关面板在 transcript 右侧 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 右侧可开关面板（拓扑图）
**Notes:** 用户提出"做成一个可单独打开和关闭的 panel"。

| Option | Description | Selected |
|--------|-------------|----------|
| 互斥 | 同一时间只能打开搜索或拓扑 | |
| 共存 | 搜索面板和拓扑面板可同时打开 | ✓ |
| 你来决定 | Agent discretion | |

**User's choice:** 共存
**Notes:** 拓扑图被 descoped 后，实际上搜索面板是唯一的右侧面板。共存决策保留以备未来拓扑图回归时使用。

---

## Agent's Discretion

- MiniSearch 配置参数（模糊距离、前缀长度、加权）
- 搜索面板宽度比例
- 时间窗口过滤预设
- 注意力分区视觉设计

## Deferred Ideas

- **拓扑图 (OVER-05)** — 用户主动 descope，认为 localhost 场景下价值不足
- **Stale-session 检测** — 长时间无活动的 session 浮现，避免误报未纳入
- **服务端全文搜索 (DASH-01)** — SQLite FTS5 无界历史搜索，已在未来需求中
