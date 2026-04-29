# AGENTS.md

## 核心原则

1. 主动质疑需求、设计和假设。发现隐藏风险、长期成本或更好的方案时，直接指出，不要为了顺从而默认同意。
2. 先读事实源，再改代码。产品事实看 `PRD.md`，实现架构看 `docs/architecture.md`，当前交付目标看 `docs/milestones/`。
3. 保持协作层边界窄。`agent-talkie` 解决跨 runtime session 协作，不扩张成通用 project-management harness、托管执行平台或长期记忆系统。
4. 保持 harness 轻量、显式、可删除。不要引入需要独立生命周期管理的隐藏工作流状态，除非它有清晰的事实源、验证入口和维护边界。
5. 用户纠偏、新领域知识和长期有效的操作经验要沉淀到正确层级，而不是停留在对话里。
6. 改动要闭环。代码、测试、文档和验证结果必须对应同一个行为目标。

## 文档路由

| 任务 | 首选事实源 |
|---|---|
| 产品模式、用户体验边界、长期非目标 | `PRD.md` |
| 中文产品镜像 | `PRD-CN.md`，仅作为 `PRD.md` 的语义镜像 |
| 包结构、架构不变量、运行时边界 | `docs/architecture.md` |
| 当前单机版产品化里程碑 | `docs/milestones/v3-local-orchestrated-product.md` |
| Adapter ingress contract | `docs/adapter-ingress.md` |
| 随产品安装的 runtime-facing Talkie skills | `.codex/skills/talkie-space/SKILL.md`、`.cursor/skills/talkie-space/SKILL.md` |
| 共享但尚未升格的经验和坑点 | `.agents/learnings.md` |
| package-local 命令和 API | 对应 package README（若存在）与源码；缺少 README 时回到 `docs/architecture.md` 和源码 |

顶层文档只保留路由、稳定约束和长期事实。临时调查、一次性验证日志、截图和调试输出放到 gitignored 目录，例如 `test-results/`、`output/` 或工具自己的临时目录。

## 目录结构约定

- `packages/` 是产品代码。每个 workspace package 应保持自己的源码、测试、build 配置；README 只在能稳定降低理解成本时新增。
- `docs/` 是长期设计与使用文档。新增 Markdown 前先判断能否并入现有文档；说不清维护边界时不要新增。
- `docs/milestones/` 只放仍有长期价值的交付定义和路线图，不放 agent 执行流水账。
- `.codex/skills/talkie-space/` 与 `.cursor/skills/talkie-space/` 是随产品安装到各 runtime 的 integration skill 源模板；它们指导 agent 使用 Talkie，但不应变成通用开发流程系统。
- `.agents/skills/` 只保留仓库需要的少量文档/写作类辅助 skill。新增 skill 前先确认它不能被更简单的文档规则或 package-local 命令替代。
- `.agents/learnings.md` 存放可复用但尚未升格为正式规范的经验；`.agents/local/` 存放本机私有备注，并且不进 git。

## 交互原则

1. 以 senior engineer / architect 的标准协作。主动 challenge、暴露 trade-off，并优先保护长期架构质量。
2. 遇到需求、领域术语、runtime 行为或组件关系不清楚时，先判断是否可以安全假设。可以安全假设时说明假设并继续；不能安全假设时先问清楚。
3. 对非平凡代码改动，在动手前说明实现切分和验证计划。小而明确的修复可以直接执行，但最终仍要给出验证结果。
4. 接入新的 runtime、MCP tool、CLI contract 或外部协议时，先用最小 spike 确认真正的 request shape、response shape、错误行为和权限边界。
5. 用户纠偏后要做一次归类：产品/架构事实写入 `PRD.md` 或 `docs/architecture.md`；当前交付范围写入 `docs/milestones/`；可复用操作经验写入 `.agents/learnings.md`；本机偏好和临时上下文写入 `.agents/local/`；一次性结论不进仓库。
6. 完成较大任务前，回看本次过程是否产生了需要沉淀的 learning。如果只是本轮事故或临时环境现象，不要写入长期文档。

## 变更流程

1. 定位：读 `AGENTS.md` 和相关事实源，确认本次改动属于产品、架构、UI、adapter、CLI、dashboard 还是文档。
2. 切小：优先做能独立验证的 vertical slice。避免为了整理而批量重构无关文件。
3. 实施：遵循现有 package 风格、测试框架和命名习惯。结构化数据优先用已有 schema、repository 或 parser，不做脆弱字符串拼接。
4. 验证：按下面的验证矩阵选择最小但充分的验证组合。涉及用户可见流程时，验证计划至少覆盖 happy path、一个主要 error path 和最可能的 edge case。
5. 闭环：验证失败时先修根因，再重跑失败项和相邻风险项。不能带着已知失败宣称完成。

## 验证矩阵

| 改动类型 | 必跑验证 |
|---|---|
| 文档-only | 完整重读被修改文档；检查权威源和镜像是否一致；`git diff --check` |
| protocol schema 或 envelope 语义 | `npm run test -w @agent-talkie/protocol` |
| SQLite schema、repository、oversight read | `npm run test -w @agent-talkie/persistence` |
| relay routing、space lifecycle、idempotency、catch-up | `npm run test -w @agent-talkie/relay` |
| supervisor 或 relay daemon 生命周期 | `npm run test -w @agent-talkie/supervisor` |
| CLI 用户命令、oversight fallback、smoke entry | `npm run test -w @agent-talkie/cli`，必要时 `npm run smoke:local` |
| shared client session behavior | `npm run test -w @agent-talkie/client` |
| Codex / stdio / Cursor MCP adapter | 对应 adapter package test；跨 runtime 行为变更还要跑 `npm run smoke:local` |
| dashboard store、bridge、Lit component | `npm run test -w @agent-talkie/dashboard` |
| 全仓行为或发布前基线 | `npm test` 与 `npm run build` |

### 验证层级判断

单元测试、集成测试、package test、CLI smoke 是基本操作。它们证明内部契约、协议分支和命令输出，但不能自动证明真实用户体验。

只在以下条件同时成立时，可以只跑 package/CLI 级验证：

- 改动局限在单个 package 或清晰的内部 API 边界内。
- 不改变用户可见 workflow、dashboard 行为、runtime join/create 流程、daemon lifecycle、presence、routing 语义或持久化数据含义。
- 不依赖浏览器 DOM、WebSocket reconnect、剪贴板、窗口打开/聚焦、真实 Cursor/Codex app、MCP 工具可见性、原生 approval/prompt 或本机 app 状态。
- 失败现象可以被 unit/integration/CLI output 充分观察，而不需要模拟用户操作路径。
- 最终汇报的 claim 只关于内部行为，例如 schema validation、repository 查询、relay routing 分支、CLI 参数解析或纯函数投影。

出现以下任一情况，必须升级到端到端验证：

- 改动影响用户会实际执行的 workflow，例如 create space、join space、copy join prompt、dashboard send、private chat、archive/destroy、setup doctor、relay stop/restart。
- 改动跨过两个以上产品边界，例如 CLI ↔ supervisor ↔ relay ↔ dashboard、runtime skill ↔ CLI、Cursor MCP ↔ relay、Codex adapter ↔ session client。
- 改动涉及生命周期或时序：daemon liveness、reconnect、reload、heartbeat、stale participant、duplicate human、防重入、ack/pull loop。
- 改动涉及 dashboard 信息架构、默认路由、composer 行为、IM-style transcript、搜索/filter、响应式布局或用户是否能看懂当前状态。
- 改动声称“用户不用手跑命令”“Codex/Cursor 可以加入”“真实 runtime 可以协作”“dashboard 会打开/聚焦”等产品体验。
- bug 是从真实 UI、真实 runtime、手动 UAT 或跨 app 操作中发现的。修复后要用相同层级或更高层级复现并验证。

端到端验证也要分层选择：

- 用 Playwright 验证浏览器可观察行为：dashboard 路由、DOM 状态、按钮、表单、WebSocket 状态、布局、截图、localStorage/sessionStorage、搜索和消息渲染。
- 用 Computer Use 验证真实桌面 runtime 行为：Codex App、Codex CLI、Cursor App、Cursor MCP 工具、原生 prompt/approval、复制 join prompt 到另一个 runtime、真实跨 app hello/ack。
- 用 `npm run smoke:local` 验证自动化本地跨 package 链路，但不要把它当成真实 app E2E 的替代品；它只能证明模拟 runtime 链路。
- 如果应该跑 E2E 但当前环境不能跑，不能声明该体验完成；必须记录 blocker、已完成的较低层验证、剩余风险和下一步验证入口。

### 验证计划

非平凡代码改动在实施前要先做验证分级判断：package/CLI 级验证是否足够，还是必须端到端验证。验证计划至少包括：

- 覆盖哪些行为：happy path、negative/error path、edge case
- 使用哪些层级：unit、integration、smoke、Playwright、Computer Use
- 什么算通过
- 是否需要保留 `test-results/` 或 `test_artifacts/` 证据

如果判断需要端到端验证，动手前或最迟开始验证前，必须向用户确认三件事：

- 用户体验影响范围：用户会感知到哪些流程、界面、runtime 行为或失败处理变化。
- 验证方式：用 Playwright、Computer Use、`npm run smoke:local` 还是它们的组合，以及为什么这样选。
- 通过标准：哪些可观察结果必须成立，哪些失败路径必须被正确处理。

端到端验证不能只覆盖 happy path。至少要包含一个能证明系统没有被“理想路径假阳性”骗过的非 happy path，例如 invalid input、missing orchestrator、stale participant、relay down/restart、duplicate join、permission/prompt interruption、archived space 不应出现在 active list、无法连接 runtime 时的错误提示等。没有 negative/error/edge 场景的 E2E 只能称为 happy-path smoke，不能作为完整 phase gate。

如果某项验证不适合当前改动，要说明原因。docs-only 改动可以跳过 build、unit、E2E，但必须做文档一致性 review 和 `git diff --check`。

### Playwright 什么时候用

使用 Playwright 验证浏览器内行为：dashboard 路由、WebSocket 连接状态、布局、按钮、表单、消息渲染、搜索/filter、截图回归，以及 desktop/mobile viewport 下是否重叠或空白。

Playwright 是 dashboard 的首选 UI 验证工具。只要问题能在浏览器 DOM、network、screenshot 或 localStorage/sessionStorage 层确认，就不要用 Computer Use 代替。

### Computer Use 什么时候用

使用 Computer Use 验证真实桌面 runtime 工作流：Codex App、Codex CLI、Cursor App、Cursor MCP 工具可见性、原生 ask-question/approval/prompt 行为、用户复制 join prompt 到另一个 runtime 后是否能完成实际协作。

Computer Use 是产品级人工工作流验证工具，不是普通 dashboard DOM 测试工具。它应在需要真实 app 集成或用户明确要求真实 runtime 验证时使用。

## 闭环解决流程

发现问题后按这个顺序处理：

1. 记录可观察失败：命令、错误、截图、UI 状态或 transcript 现象。
2. 缩小根因：先判断是协议、持久化、relay、adapter、dashboard、runtime skill 还是环境配置问题。
3. 做最小修复：优先修导致失败的行为，不顺手重写周边结构。
4. 重跑验证：先重跑失败项，再跑相邻风险项。例如修 relay routing 后至少重跑 relay tests 和受影响 adapter/CLI tests。
5. 更新事实源：如果行为、约束或用户流程改变，同步更新 `PRD.md`、`PRD-CN.md`、`docs/architecture.md`、milestone 或 package README。
6. 仍失败时继续闭环，直到通过或明确列出阻塞原因、剩余风险和下一步验证。

## 文档纪律

1. 任何时候只要阅读或修改了项目文档，在结束任务前都必须重新完整通读被修改文档。不要只依赖局部 diff。
2. 新增注记、附录或设计想法时，必须对照该主题权威来源做一致性检查。存在冲突时同步修正权威来源。
3. `PRD.md` 是产品文档权威来源，`PRD-CN.md` 是镜像译本。修改其中一个时必须同步检查另一个，并确认语义、结构和范围一致。
4. 文档和代码矛盾时，把矛盾当作 bug：要么修文档，要么修代码，不留下分叉事实。
5. 不把一次性删除、迁移、纠偏或历史事故写成长效规则。需要沉淀经验时，写成未来可复用的判断标准，而不是保留旧对象的名字。
6. 新增 Markdown 必须有明确维护边界。能并入 `AGENTS.md`、`PRD.md`、`docs/architecture.md`、`docs/milestones/`、package README 或 `.agents/learnings.md` 的内容，不另建文件。
7. 一次性报告、调试流水账、截图说明、会议笔记、agent 大段分析和临时调查默认不进仓库文档层。需要保留时放到 gitignored artifacts 或最终交付说明里。
8. Design doc 只在长期影响大、trade-off 明显、涉及 migration 或端到端行为复杂时新增。长期保留的部分应是 observable behavior、invariants、compatibility constraints、E2E scenarios 和 pass criteria。

### Markdown 命名规则

1. 普通内容页使用 lowercase-kebab-case，例如 `docs/adapter-ingress.md`、`docs/milestones/v3-local-orchestrated-product.md`。
2. 仓库根部、package 根部或工具识别的入口文件可以使用大写约定，例如 `AGENTS.md`、`README.md`、`SKILL.md`、`PRD.md`、`MILESTONES.md`。
3. 大写文件名只用于入口、标准社区文件、稳定 acronym 或兼容性指针。需要分隔词时使用 hyphen，不使用 underscore。
4. 新增长期文档默认放在 `docs/` 下并使用 lowercase-kebab-case。只有被工具识别或作为顶层入口时，才新增大写 Markdown。
5. 修改文件名时必须同步更新所有引用，并跑 `rg` 确认没有旧路径残留。

## Git 与工作区纪律

1. 可能存在用户留下的 dirty changes。不要 revert 未经确认的用户改动。
2. 不提交临时 artifacts、截图输出、测试缓存或本机状态。
3. 移除现有目录、工具或机制前，先确认其中没有仍需保留的长期事实；需要保留时先迁移到正确事实源。
