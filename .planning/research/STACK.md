# Stack research: v2.0 web dashboard (Lit + Vite)

**Scope:** Additions and changes for the **new** real-time interactive web dashboard only.  
**Assumes unchanged:** Node/TS monorepo, `ws` relay, SQLite/`better-sqlite3`, Zod 4, Vitest, protocol/adapters (per `.planning/PROJECT.md`).  
**Design reference:** OpenClaw-style **Lit (Web Components) + Vite** (`packages/dashboard-lit` pattern: app shell, hash routing, gateway WebSocket provider, theme tokens — see [openclaw/openclaw#23345](https://github.com/openclaw/openclaw/pull/23345)).  
**Versions:** Pinned from `npm view <pkg> version` on **2026-04-17** unless noted. Context7 used for Vite proxy/HMR and Lit APIs ([Vite server proxy](https://github.com/vitejs/vite/blob/main/docs/config/server-options.md), Lit element examples in `/lit/lit`).

---

## 1. UI framework: Lit (`lit`)

| Field | Value |
|--------|--------|
| **Package** | `lit` |
| **Suggested range** | `^3.3.2` (registry: **3.3.2**) |
| **Rationale** | **Why Lit:** Small runtime, standards-based custom elements, shadow DOM for style isolation, excellent fit for a **localhost dashboard** that should stay lightweight and avoid a heavy SPA framework. Reactive properties and `lit-html` map cleanly to streaming UI updates (WebSocket → state → re-render). **Why not React/Vue/Svelte here:** All are viable; they add larger runtime/build assumptions and stronger opinions on state management. For “OpenClaw parity” and a control-plane UI that is mostly forms, lists, and one graph, Lit keeps the bundle small and aligns with the cited reference implementation. |
| **Integration** | New workspace package (e.g. `@agent-talkie/dashboard` or `packages/dashboard`). Use `LitElement` + `html`/`css` from `lit`; TypeScript + `lit` decorators (`lit/decorators.js`) match the rest of the monorepo. Share **types only** (or generated JSON Schema clients) from `@agent-talkie/protocol` — avoid importing Node-only packages into browser bundles. |

---

## 2. Build / dev server: Vite (`vite`)

| Field | Value |
|--------|--------|
| **Package** | `vite` |
| **Suggested range** | `^8.0.8` (registry: **8.0.8**; Context7 catalog lists **8.0.x**) |
| **Rationale** | **Why Vite:** Fast dev server, first-class TS, native ESM, HMR — standard pairing with Lit for local development. Production build outputs static assets the relay can serve. **Why not Webpack/Rsbuild only:** Vite is the stated direction and matches OpenClaw; no need for a second bundler story. |
| **Integration — development** | Run the dashboard dev server on a **separate port** (e.g. 5173). Use `server.proxy` with **`ws: true`** so the browser opens `ws://localhost:5173/...` and Vite forwards to the relay’s `ws://127.0.0.1:<relayPort>` (relay port from env or supervisor lock file). Official docs warn about `rewriteWsOrigin` security on non-localhost; for **127.0.0.1-only** this is acceptable. If HMR and relay proxy share quirks, configure `server.hmr` (`clientPort` / `path`) per [Vite server options](https://github.com/vitejs/vite/blob/main/docs/config/server-options.md). |
| **Integration — production** | `vite build` → `dist/` with `base: '/'` (or a subpath if you mount the UI under e.g. `/app/`). **Serving from relay:** extend the existing `http.createServer()` in `@agent-talkie/relay` (today only `/__agent-talkie/v1/health` when `relayGenerationToken` is set — see `packages/relay/src/server.ts`) to serve `GET /` and static assets from `dashboard/dist` (or embed paths under `/__agent-talkie/v1/ui/`). Same **origin and port** as the relay gives the simplest WebSocket URL (`ws` or `wss` relative upgrade) and avoids CORS. **Middleware mode** (`server.middlewareMode` + parent `http.Server`) is documented for advanced cases where Vite dev must share the parent server’s WebSocket proxy; for agent-talkie, **separate dev ports + proxy** is usually simpler than merging Vite into the relay process during development. |

---

## 3. TypeScript & tooling alignment

| Field | Value |
|--------|--------|
| **Package** | `typescript` (workspace-aligned) |
| **Suggested range** | Match existing workspace (**^5.9.x** per `@agent-talkie/relay`) |
| **Rationale** | Single compiler version across packages avoids type declaration skew. |
| **Integration** | Dashboard `tsconfig` with `"moduleResolution": "bundler"`, `"target": "ES2022"` (or project default), `vite/client` types for `import.meta.env`. |

---

## 4. Component library (Lit-friendly Web Components)

| Option | Package | Suggested range | Rationale | Integration |
|--------|---------|-----------------|------------|-------------|
| **Primary** | `@shoelace-style/shoelace` | `^2.20.1` (registry: **2.20.1**) | Framework-agnostic Web Components: inputs, dialogs, menus, badges — fits **interactive controls** (send message, orchestrator, invites) without React. Good accessibility baseline. | Import components as side effects or cherry-pick; theme via CSS variables (works across shadow roots if using Shoelace’s design tokens / `::part` where needed). |
| **Alternative** | `@material/web` | `^2.4.1` (registry: **2.4.1**) | Material Design 3 web components; slightly different aesthetic and bundle tradeoffs. | Same pattern: custom elements in Lit templates via tags. |

**Rationale (pick one):** Prefer **Shoelace** for a dashboard control surface (dense forms, dialogs, tables) with minimal theming work; **Material Web** if you want strict M3 visuals.

---

## 5. Topology / graph visualization

| Field | Value |
|--------|--------|
| **Package** | `cytoscape` |
| **Suggested range** | `^3.33.2` (registry: **3.33.2**) |
| **Rationale** | **Why Cytoscape.js:** Mature graph layout (force-directed, breadthfirst, etc.), styling per node/edge, pan/zoom — fits **session topology** (nodes = sessions/humans/orchestrator, edges = message or “attention” relationships). Imperative API: update elements from WebSocket events without fighting a React renderer. **Alternatives:** `d3-force` (more DIY), `sigma.js` (great for very large graphs; likely overkill for localhost session counts), `vis-network` (similar class to Cytoscape; either is fine — pick one and avoid both). |
| **Integration** | Mount a single `<div id="graph">` in a Lit component; in `firstUpdated` or `updated`, call `cytoscape({ container, elements, style, layout })`. On teardown, `cy.destroy()`. Keep graph state in a small controller class the WebSocket provider updates. |

---

## 6. Searchable transcript (client-side index)

| Field | Value |
|--------|--------|
| **Package** | `minisearch` |
| **Suggested range** | `^7.2.0` (registry: **7.2.0**) |
| **Rationale** | Full-text index in the browser: **filterable/searchable transcript** with modest bundle size. Works well when transcript chunks are pushed over WebSocket and appended to an in-memory document list. **Alternative:** `fuse.js` **^7.3.0** — stronger fuzzy ranking, slightly different API; choose one indexing library, not both. |
| **Integration** | On each new transcript event (or batch catch-up), `index.add()` / `index.addAll()`. Debounce search input; render results in a virtualized list (below). For very large histories, consider **server-assisted** search later via SQLite FTS in the relay — out of this “stack” doc except to note the dependency. |

---

## 7. Long lists: virtualization

| Field | Value |
|--------|--------|
| **Package** | `@lit-labs/virtualizer` |
| **Suggested range** | `^2.1.1` (registry: **2.1.1**) |
| **Rationale** | Official Lit Labs package for virtualizing long transcript/event lists without pulling in React-window equivalents. |
| **Integration** | Wrap repeating `lit-html` rows in `<lit-virtualizer>` (or the Lit 3 integration pattern from current docs) so search results and live tail both stay performant. |

---

## 8. CSS approach

| Field | Value |
|--------|--------|
| **Approach** | **`static styles` + CSS in Lit** (`css` tagged template) per component; **global design tokens** on `:root` (colors, spacing, typography) consumed via CSS variables inside shadow roots. |
| **Rationale** | Matches OpenClaw-style theming (dark default, tokens). Shadow DOM prevents style leakage — important when mixing Shoelace/Material and app components. **Why not Tailwind in components by default:** Doable with build plugins, but adds convention surface; optional later if the team wants utility-first. **Why not CSS-in-JS runtime:** Unnecessary with Lit’s built-in `css` templates. |
| **Integration** | One `theme.css` imported from `index.html` for tokens; Lit components use `var(--token)`. Respect `prefers-reduced-motion` for layout/graph transitions (aligns with accessibility patterns in OpenClaw’s dashboard PR). |

---

## 9. WebSocket client (dashboard feed)

| Field | Value |
|--------|--------|
| **Package** | **Browser `WebSocket` (built-in)** — no extra dependency. |
| **Rationale** | Relay already uses canonical JSON-over-`ws` with a **handshake-first** flow (`packages/relay/src/server.ts`). The dashboard must not introduce **Socket.io** or a second framing layer. **Product note (not a npm dep):** today every connection goes through `relayClientHandshakeSchema` then session registration; the milestone needs a **defined story** — e.g. dedicated `WebSocketServer` **path** for dashboard traffic, or a **human/dashboard session** type in the existing protocol. That is an **integration design** task; the stack choice remains “native WebSocket + your JSON contract.” |
| **Integration** | Reconnect with exponential backoff; single module “connection provider” feeding Lit contexts or a tiny store. Parse messages with the same Zod schemas as the relay **where schemas are browser-safe** (keep schemas in `@agent-talkie/protocol` free of Node imports). |

---

## 10. Optional: static file helper on relay

| Field | Value |
|--------|--------|
| **Package** | `serve-static` (optional) |
| **Suggested range** | `^2.2.1` (registry: **2.2.1**) |
| **Rationale** | Express-style static middleware for `http.createServer` without adopting Express. **Alternative:** hand-roll `fs.createReadStream` + MIME table for a tiny surface. |
| **Integration** | In relay HTTP handler chain: try static file for `GET`, fall through to health route and 404. Ensure `Upgrade: websocket` requests are **not** swallowed by static middleware (current pattern already returns early on upgrade in the health handler path). |

---

## 11. Testing additions (dashboard-only)

| Field | Value |
|--------|--------|
| **Unit / component** | Keep **Vitest** for pure TS (indexing, reducers, WS message parsers). For DOM components, either **@web/test-runner** (registry **0.20.2**) + `@open-wc/testing` or **Playwright** component tests — pick one to avoid three runners. |
| **E2E** | **Playwright** (already a common choice alongside Vitest in TS repos) for “open dashboard → see topology → send control message” against a test relay instance. |
| **Rationale** | Vitest alone does not run real browsers; Lit components benefit from at least one browser-level test for critical paths. |

---

## 12. What **not** to add (explicit)

| Avoid | Why |
|--------|-----|
| **Socket.io**, **uWebSockets.js** (for dashboard) | Second protocol or native addon complexity; contradicts canonical `ws` + JSON envelope. |
| **React / Next / Remix** for this milestone | Valid technically but diverges from stated Lit + Vite reference and increases bundle/runtime surface. |
| **Postgres / Redis / hosted realtime** | Violates zero-external-services default (per `PROJECT.md`). |
| **Duplicate validation stacks** | Use Zod 4 + existing protocol patterns; do not add io-ts/valibot for the same envelopes without a compelling reason. |
| **Heavy charting frameworks** for topology | Chart.js / ECharts are series/cartesian-first; prefer a **graph** library (Cytoscape or equivalent). |

---

## 13. Suggested `package.json` sketch (new workspace)

Dependencies (production-oriented):

- `lit` ^3.3.2  
- `@shoelace-style/shoelace` ^2.20.1 *(or `@material/web` ^2.4.1)*  
- `cytoscape` ^3.33.2  
- `minisearch` ^7.2.0 *(or `fuse.js` ^7.3.0)*  
- `@lit-labs/virtualizer` ^2.1.1  
- `@agent-talkie/protocol` (workspace) — types/schemas only  

DevDependencies:

- `vite` ^8.0.8  
- `typescript` (align with root/workspace)  
- Vitest + optional `@web/test-runner` or Playwright  

Relay package optional addition:

- `serve-static` ^2.2.1 *(or manual static serving)*  

---

## 14. Confidence

| Topic | Confidence | Notes |
|--------|------------|--------|
| Lit + Vite pairing | **High** | Ecosystem standard; OpenClaw reference PR. |
| Vite `proxy` + `ws: true` | **High** | Verified against Vite official docs via Context7. |
| Version numbers | **High** | `npm view` on 2026-04-17. |
| Dashboard WebSocket join semantics | **Medium** | Requires protocol/relay design; stack stays native `WebSocket`. |
| Cytoscape vs alternatives | **Medium** | Strong default for topology; final choice should follow prototype UX (layout, edge count). |

---

## Sources

- npm registry (`npm view`), 2026-04-17  
- Vite: [server.proxy / WebSocket](https://github.com/vitejs/vite/blob/main/docs/config/server-options.md), [middleware mode + WS](https://github.com/vitejs/vite/blob/main/docs/guide/api-javascript.md) (via Context7 `/vitejs/vite`)  
- Lit: `/lit/lit` on Context7 (LitElement / reactive properties)  
- OpenClaw dashboard direction: [PR #23345](https://github.com/openclaw/openclaw/pull/23345)  
- Current relay HTTP surface: `packages/relay/src/server.ts` (health route + shared `http` + `ws` server)
