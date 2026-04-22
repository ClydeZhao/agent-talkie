# Phase 8: Dashboard distribution & CLI entry - Research

**Researched:** 2026-04-17  
**Domain:** Node `http` 静态资源、`ws` 同端口升级、Vite 双产物（lib + SPA）、npm 打包路径、`commander` CLI  
**Confidence:** HIGH（代码库与官方文档交叉验证）/ MEDIUM（CI 具体文件需落地时确认）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### URL Path Design
- **D-01:** Dashboard is served under `/dashboard` prefix — e.g. `http://127.0.0.1:18765/dashboard`. Short, memorable, leaves root path available for future use.
- **D-02:** Existing API routes (`/__agent-talkie/v1/health`, WebSocket upgrade) continue unchanged under their current paths. No collision with dashboard paths.
- **D-03:** SPA fallback: any request under `/dashboard` that doesn't match a static file returns `index.html` so client-side routing works if added later.

#### CLI `talkie dashboard` Behavior
- **D-04:** Command auto-opens the default browser AND prints the URL to stdout.
- **D-05:** Command ensures relay is running first (via `ensureRelayRunning` from supervisor). If relay is already running, reuse it.
- **D-06:** Command is non-blocking — prints URL, opens browser, exits. The relay continues running as a daemon (existing lifecycle).

### Claude's Discretion
- Static file serving middleware choice (sirv, hand-rolled, or other lightweight option compatible with raw `http.createServer()`)
- Vite build configuration changes: how to produce `index.html` + bundled assets for production while preserving existing bridge/component exports
- Asset path resolution at runtime: how the relay package locates `@agent-talkie/dashboard/dist` (require.resolve, relative path, or package exports field)
- Whether to add a `--no-open` flag for CI/headless environments (recommended but agent's call)
- Build integration: whether CI/monorepo builds dashboard before relay, or relay's build script triggers dashboard build

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONN-03 | Relay serves dashboard static assets on same origin in production | `createRelayServer` 已用同一 `http.Server` 挂 `WebSocketServer`；在 `upgrade` 请求上早退即可与静态中间件共存；Vite `base: '/dashboard/'` + relay 上 `sirv` + `single: true` 满足 SPA 与同源静态资源。 |
| CONN-04 | User can open dashboard via `talkie dashboard` CLI command | `ensureRelayRunning` 已返回 `port`/`generation`；`talkie ping` 已有 health URL 拼装范式；`open@11` 跨平台打开浏览器；URL 固定为 `http://127.0.0.1:<port>/dashboard`（与 LISTEN_HOST 一致）。 |
</phase_requirements>

## Summary

本阶段要在**不引入 Express** 的前提下，让 relay 进程在 `127.0.0.1:<port>` 上同时承担：WebSocket 升级、现有 `/__agent-talkie/v1/health`、以及 **`/dashboard` 下的生产静态资源**（含 SPA fallback）。Dashboard 包当前 Vite 为 **library 模式**，产物写入 `dist/`，与「可部署的 `index.html` + hash 资源」需求冲突，需增加**第二条构建管线**（独立 `outDir`，例如 `dist-app`），并设置 `base: '/dashboard/'`，使打包后的 `index.html` 引用路径与 D-01 一致。

CLI 侧沿用 `ensureRelayRunning({})` 保证 daemon 与 lock 文件一致；在取得 `port` 后构造 `http://127.0.0.1:${port}/dashboard`，**stdout 打印**并用 **`open` 包**打开浏览器即可满足 D-04～D-06。Relay 已通过 `@agent-talkie/supervisor` → `@agent-talkie/relay` 被 CLI 间接安装；在 **`@agent-talkie/relay` 上声明对 `@agent-talkie/dashboard` 的依赖** 并确保 `dashboard` 的 `files` 包含 SPA 产物，可满足 `npm install` / `npx` 下静态文件不 404。

**Primary recommendation:** relay 内用 **sirv**（原生 `http` 兼容、支持 `single` SPA fallback）挂载 dashboard 的绝对目录；dashboard 增加 **Vite app 构建** 输出到 `dist-app`；CLI 增加 `dashboard` 子命令 + 可选 `--no-open`。

## Project Constraints (from .cursor/rules/)

摘自 `.cursor/rules/gsd-context.md` 中与实现相关的约束（规划与实现须一致）：

- **默认路径零外部服务**：不向默认路径引入 NATS/Postgres/云消息总线等。[CITED: `.cursor/rules/gsd-context.md`]
- **传输**：canonical 为 **WebSocket relay**，协议层保持单一。[CITED: `.cursor/rules/gsd-context.md`]
- **打包**：`npm install` / `npx` 可用，无额外基础设施。[CITED: `.cursor/rules/gsd-context.md`]
- **GSD**：常规功能开发应通过 GSD 工作流入口，避免规划与执行脱节。[CITED: `.cursor/rules/gsd-context.md`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|----------------|
| **sirv** | **3.0.2**（`npm view sirv version` 2026-04-17） | 在原生 `http` 上提供 `(req, res, next)` 静态中间件；`single: true` 实现 SPA fallback | npm README 写明可与 Node **`http`/`https`/`http2`** 配合使用；生产模式预扫描文件系统，避免每次请求 stat。[CITED: [npm sirv](https://www.npmjs.com/package/sirv)] |
| **open** | **11.0.0**（`npm view open version`） | CLI 中跨平台打开默认浏览器 | 社区常用、API 简单；满足 D-04。[VERIFIED: npm registry] |
| **Vite** | 仓库已钉 **8.0.8**（`packages/dashboard/package.json`） | 第二条构建：以 `index.html` 为入口的 SPA 生产构建 | 与现有 dashboard 工具链一致。[VERIFIED: 代码库] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **serve-static** | 2.2.1（`npm view`，未采用为默认） | Express 系常见静态中间件 | 项目 relay **非 Express**；sirv 更贴合「裸 `http` + 轻量」。[VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sirv | 自写 `fs.createReadStream` + MIME | 易漏 `Range`、缓存头、路径规范化与安全边界；维护成本高 |
| sirv | `serve-handler`（Vercel） | 可行；需核对与裸 `http` 的集成面与包体积 |
| `open` | 仅 `child_process` 调 `open`/`xdg-open` | 可省依赖；跨平台分支与 edge case 多，**open** 更省事 |

**Installation（供规划引用）：**

```bash
npm install sirv@^3.0.2 --workspace @agent-talkie/relay
npm install open@^11.0.0 --workspace @agent-talkie/cli
```

**Version verification:** `sirv@3.0.2`、`open@11.0.0`、`serve-static@2.2.1` — 均经本环境 `npm view` 核对。[VERIFIED: npm registry]

## Architecture Patterns

### 推荐集成形状（与现有代码对齐）

```
packages/relay/src/server.ts
  http.createServer()
  ├─ request: ① WebSocket upgrade → return（交给 ws，勿写 res） [现有]
  │            ② GET /__agent-talkie/v1/health → JSON [现有，仅 relayGenerationToken 存在时]
  │            ③ /dashboard* → sirv(staticRoot, { single: true })(req, res, fallthrough)
  │            ④ 其余 → 明确 404 或 no-op（见下方陷阱）
  └─ WebSocketServer({ server }) [现有]
```

**静态根目录解析（推荐模式）：** 在 relay 编译产物中使用 `createRequire(import.meta.url).resolve('@agent-talkie/dashboard/package.json')`，再 `join(dirname(pkgJson), 'dist-app')`，避免依赖 `process.cwd()`。[ASSUMED: 与 ESM + 已发布包解析习惯一致；若改用 `import.meta.resolve`，需确认目标 Node 版本与 tsup 输出]

**Dashboard 双产物：**

| 产物 | 用途 | outDir 建议 |
|------|------|-------------|
| Library（现有） | `@agent-talkie/dashboard` 的 TS/组件 API | `dist/`（保持 `vite.config.ts` lib 构建） |
| SPA shell（新增） | relay 同源自托管 | `dist-app/` + `base: '/dashboard/'` |

**Vite：** 单独 `vite.app.config.ts`（或等价）使用默认 **application** 构建（非 `build.lib`），`build.outDir: 'dist-app'`，`base: '/dashboard/'`。[VERIFIED: 与 Vite 多配置惯例一致] [CITED: 项目现有 `vite.config.ts` 对比]

### 前端同源 WebSocket URL

当前 demo 硬编码 `ws://127.0.0.1:18765`（`packages/dashboard/src/demo/main.ts`）。生产托管在 `http://127.0.0.1:<port>/dashboard/` 时，应改为由 **`window.location`** 推导，例如：

`const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;`

这样 CONN-03 的「与 relay 同源」在 HTTP/WS 语义下成立（同 host:port）。[VERIFIED: 代码库 grep]

### Anti-Patterns to Avoid

- **在 upgrade 请求上写入 `res` 或让 sirv 处理 upgrade：** 会破坏 `ws` 升级握手。[CITED: 现有 `server.ts` 对 `upgrade` 早退]
- **继续只用 library 构建充当 SPA：** 不会生成带脚本的 `index.html` 布局，生产必 404。[VERIFIED: `packages/dashboard/vite.config.ts`]
- **把静态目录绑在 `process.cwd()`：** `npx`、全局安装时 cwd 非包内，路径必错。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 静态文件 MIME、缓存、SPA fallback、404 | 手写路由表 | **sirv**（`single: true`） | 与 D-03 一致；减少安全与行为缺口 [CITED: npm sirv] |
| 跨平台打开浏览器 | shell 里硬编码 `open`/`start` | **open** 包 | Windows/macOS/Linux 行为统一 [VERIFIED: npm] |
| 解析已安装包的磁盘路径 | 相对 `../../dashboard/dist` | **`require.resolve` / `import.meta.resolve` + package.json** | 发布与 workspace 下路径稳定 |

**Key insight:** relay 已是「单进程 + 裸 HTTP + ws」，选 **sirv** 比拉 Express 中间件链更符合栈约束。

## Common Pitfalls

### Pitfall 1: HTTP 请求无人 `end`（挂死连接）

**现象：** 浏览器或 curl 一直 pending。  
**根因：** `server.ts` 在 `relayGenerationToken` 分支里对非 health 路径 **直接 `return` 而不 `res.end()`**（`upgrade` 除外）；若新增静态层后仍未覆盖所有分支，会重复该问题。  
**规避：** 合并为单一 `request` 处理链，或保证最后一层对「非 dashboard、非 health、非 upgrade」返回 **404**。  
**早期信号：** 集成测试里对 `GET /` 或随机路径做超时断言。  
[VERIFIED: `packages/relay/src/server.ts` 206–227 行行为]

### Pitfall 2: `outDir` 与 lib 构建互相 `emptyOutDir`

**现象：** 先构建的 `dist` 或 `dist-app` 被另一轮构建清空。  
**规避：** 两个 outDir 分离；或关闭其中之一的 `emptyOutDir`，并固定 **build 顺序**（例如先 lib 后 app）。  
[VERIFIED: 当前 `vite.config.ts` 中 `emptyOutDir: true`]

### Pitfall 3: WebSocket 与 `base` 不一致

**现象：** 页面能开，但连不上 relay。  
**规避：** 生产入口脚本使用 **同源** `wsUrl`（见上文）；dev 仍可用 Vite proxy（现有 `/__agent-talkie`）。  
[VERIFIED: `packages/dashboard/vite.config.ts` proxy]

### Pitfall 4: npm 包未包含静态文件

**现象：** 本地 workspace 正常，`npm pack` 安装后 404。  
**规避：** `@agent-talkie/dashboard` 的 **`files`** 字段包含 `dist-app`（及原 `dist`）；relay 依赖 dashboard 确保安装树中有该目录。  
[VERIFIED: `packages/relay/package.json` 仅 `"files": ["dist"]`；dashboard 同理需扩展]

## Code Examples

### sirv + 裸 http（官方 README 语义）

```js
// Source: https://www.npmjs.com/package/sirv — Usage / native http 说明
import http from 'node:http';
import sirv from 'sirv';

const assets = sirv('public', { single: true });
const server = http.createServer((req, res) => {
  assets(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});
```

（实际集成时需先剥离 `/dashboard` 前缀或改写 `req.url`，再调用 `sirv`。[ASSUMED: 常见挂载写法，需在实现单测中验证]）

### ensureRelayRunning 与 ping 的 URL 拼装（项目内范式）

```93:109:packages/cli/src/cli.ts
program
  .command("ping")
  .description("Ensure relay and check health endpoint")
  .action(async () => {
    try {
      const { port, generation } = await ensureRelayRunning({});
      const url = `http://127.0.0.1:${port}/__agent-talkie/v1/health?generation=${encodeURIComponent(generation)}`;
      const res = await fetch(url);
      // ...
```

`talkie dashboard` 可复用同一 `port`，路径改为 `/dashboard`。[VERIFIED: 代码库]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 仅 Vite dev server + proxy 联调 | relay 进程内托管生产静态资源 | Phase 8 | 满足 CONN-03 与「无单独 dev-server 源」 |
| demo 内写死默认 WS URL | 生产用 `location` 推导 WS | Phase 8 | 同端口、无 CORS/混合内容问题 |

**Deprecated/outdated:** 无（本阶段为增量能力）。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | 通过 `join(dirname(require.resolve('@agent-talkie/dashboard/package.json')), 'dist-app')` 在发布包中可解析到正确目录 | Architecture | 若包导出或 `exports` 限制访问，则需增加显式 `exports` 子路径 |
| A2 | 剥离 `/dashboard` 前缀后对 `req.url` 的改写与 sirv 组合在 Node 22 下无副作用 | Code Examples | 应用集成测试覆盖 `GET /dashboard`、`/dashboard/foo`、静态 asset |

## Open Questions (RESOLVED)

1. **根路径 `GET /` 在 daemon 模式下是否应返回 404 或简短说明？**
   - RESOLVED: Phase 8 保持 D-02「根路径预留给未来」。`GET /` 返回 404（或 sirv 默认空目录响应）。不自动重定向到 `/dashboard`。CONTEXT D-01 明确指定 dashboard 在 `/dashboard` 前缀下。

2. **`@agent-talkie/dashboard` 是否保持 `private: true` 若未来发布到 npm？**
   - RESOLVED: 保持 `private: true`。Dashboard 作为 monorepo 内部包，relay 通过 workspace 依赖引用。公共发布策略不在 Phase 8 范围内。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | 全仓 | ✓ | v22.14.0（本机探测） | 文档声明 `>=20` |
| npm workspaces | 构建顺序 | ✓ | 随 Node | — |
| 操作系统 `open` 命令 | 无 `open` 包时的浏览器打开 | ✓ | — | 安装 `open` 包（推荐） |

**缺失且无降级：** 无（Phase 8 不强制 CI 新服务）。

## Security Domain

> `workflow.nyquist_validation` 为 false；仍给出与静态托管相关的最小控制项。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | yes | 仅服务 `dist-app` 根下文件；**sirv** 默认不暴露 dotfiles；路径来自 sirv 内部解析 |
| V4 Access Control | 低 | 本阶段仍为 localhost relay；与 RSEC 远程无关 |
| V9 Communication | 低 | 同机 HTTP；后续 `wss` 非本阶段 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 路径穿越（`../`） | Tampering | 使用成熟静态中间件、根目录固定为 package 内 `dist-app` [CITED: npm sirv] |
| 误把可写目录当静态根 | Elevation | 构建产物只读；运行时不可指向用户数据目录 |

## Sources

### Primary (HIGH confidence)
- 代码库：`packages/relay/src/server.ts`、`packages/relay/src/daemon.ts`、`packages/cli/src/cli.ts`、`packages/supervisor/src/ensure-relay.ts`、`packages/dashboard/vite.config.ts`、`packages/dashboard/src/demo/main.ts`
- [npm sirv](https://www.npmjs.com/package/sirv) — README（原生 `http`、`single` SPA）

### Secondary (MEDIUM confidence)
- `npm view` 注册表版本号（sirv、open、serve-static）

### Tertiary (LOW confidence)
- `req.url` 剥离前缀与 sirv 的具体组合细节 — **需实现时单测锁定**

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — sirv/open 版本已查注册表；与裸 http 兼容性有官方 README 依据
- Architecture: **MEDIUM-HIGH** — 与现有 `server.ts` 结构对齐；细节依赖单测
- Pitfalls: **HIGH** — 来自对 `server.ts` 控制流的直接阅读

**Research date:** 2026-04-17  
**Valid until:** ~2026-05-17（依赖版本以 npm 为准，建议计划前复跑 `npm view`）

---

*Nyquist Validation Architecture：本仓库 `.planning/config.json` 中 `workflow.nyquist_validation` 为 **false**，按规范省略验证架构专节。*
