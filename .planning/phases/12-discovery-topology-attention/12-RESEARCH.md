# Phase 12: Discovery, topology & attention - Research

**Researched:** 2026-04-22  
**Domain:** 客戶端全文搜尋（MiniSearch）+ Lit 分欄佈局 + 名册內關注區塊；**本階段不含**拓樸/圖視覺化（OVER-05 已自本階段移除）。  
**Confidence:** HIGH（MiniSearch 與現有代碼路徑已核對）/ MEDIUM（分欄+篩選後虛擬清單索引一致性需在 PLAN 中明確寫清）

<user_constraints>
## User Constraints（來自 12-CONTEXT.md）

### Locked Decisions
- **D-01:** MiniSearch（~7KB gzip）作客戶端全文索引；從 `DashboardStore.transcriptLines` 建索引，無需伺服器搜尋。
- **D-02:** 索引欄位：寄件人 `displayName`、envelope `type`、payload 預覽文字；權重偏寄件人與 type（操作導向查詢）。
- **D-03:** 右側搜尋面板，可由 transcript 標題區圖示切換開關。
- **D-04:** 分欄——面板開啟時 transcript 變窄，結果列在右側，同屏可見。
- **D-05:** 結果列顯示時間、寄件人、kind/type、帶關鍵字提示的摘錄；點擊結果捲動 virtualizer 至對應條目。
- **D-06:** 篩選維度：寄件人（roster 的 displayName）、envelope kind（`control`/`conversation`）、時間窗。
- **D-07:** 篩選以 **AND** 組合。
- **D-08:** 篩選以 chip 顯示，可 × 移除。
- **D-09:** 篩選同時套用在**全文搜尋結果**與**主 transcript 畫面**；僅有篩選、無關鍵字時，主畫面 transcript 就地在篩選後的列表上顯示。
- **D-10:** 關注列為名册**頂部**內嵌「Needs Attention」區，位於一般 session 清單之上；blocked 從一般列表**抽出**。
- **D-11:** 觸發條件：僅 `progress === "blocked"`。
- **D-12:** 與一般名册明顯區隔（背景/邊框），條目顯示 session 名、blocked 原因、緊急指示（沿用紅點等既有樣式）。
- **D-13:** 無 blocked session 時**整段隱藏**，不留空標題。

### Agent's Discretion
- MiniSearch 參數（fuzzy 距離、前綴、權重）、搜尋面板寬度比、搜尋圖示與擺放、時間窗預設、chip 樣式、面板開關是否記住、點擊結果的捲動/高亮策略、快捷鍵（如 Cmd+K / Ctrl+F）。

### Deferred Ideas（本階段與本文件均不展開）
- **OVER-05 拓樸圖**、stale session 偵測、伺服端 FTS（DASH-01）等——見 12-CONTEXT `## Deferred Ideas`。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | 說明 | 研究支撐 |
|----|------|----------|
| **OVER-03** | 依寄件人、訊息 kind、時間窗搜尋/篩選 transcript | MiniSearch 欄位 + `search({ filter })` 與/或陣列篩選；分欄 UI；與 `lit-virtualizer` 的捲動索引 |
| **OVER-06** | 阻斷/關注列，突顯需人工處理的 session | `RosterRow.progress` / `blockedReason`；`talkie-roster` 上緣區塊 + 自排序列表排除重複 |
</phase_requirements>

## Project Constraints（來自 .cursor/rules/gsd-context.md 等）

- **零預設外部服務**（NATS/Postgres/雲即時庫等）：本階段採**瀏覽器內**索引與現有 store，不新增遠端搜尋服務（與 D-01 一致；伺服端 FTS 已列為未來 DASH-01）。  
- **儀表板技術棧**：Lit + TypeScript + Vite；**不要**在預設路徑引入 React/Vue 作為主 UI（`PROJECT.md` / 專案慣例）。  
- 若之後需同步 `ROADMAP.md` / `REQUIREMENTS.md` 的 **OVER-05 敘述與本階段實際範圍**，應在討論/遷移流程中一併修正（避免計畫讀到過期「拓樸/Cytoscape」條目）。  

## Summary

本階段在**不改 relay 協定**的前提下，把「已載入的 `transcriptLines`」建成 MiniSearch 倒排索引，並以右側面板呈現關鍵字命中與多維度 **AND** 篩選；篩選狀態同時驅動主欄位 virtualizer 的**可見行集合**，以滿足 D-09。名册側在維持既有 blocked 紅框/紅點語意下，把 `progress === "blocked"` 的成員**單獨**拉到頂部「Needs Attention」區，並從下方一般排序列表中**剔除**，避免同一 session 出現兩次。

**Primary recommendation:** 在 `DashboardStore`（或專用薄模組）內集中維護「索引與 `dedupeKey` 對照」+「篩選+搜尋的衍生列表」，`TalkieTranscript` 只綁定**當前應顯示的** `TranscriptLine[]` 與捲動 API；`TalkieRoster` 用兩段模板（關注區 + 其餘）渲染，資料皆來自同一 `roster` Map。

## Standard Stack

### Core

| 套件 | 版本 | 用途 | 為何為預設 |
|------|------|------|------------|
| **minisearch** | `7.2.0` [VERIFIED: `npm view minisearch version`] | 客戶端全文索引、前綴/fuzzy、欄位加權、`search({ filter })` 二次過濾 [CITED: [MiniSearch README](https://raw.githubusercontent.com/lucaong/minisearch/master/README.md)] | 體小、零依賴、與 D-01 一致；文檔明確支援動態 `add`/`addAll`/`remove` |
| **@lit-labs/virtualizer** | `^2.1.1`（倉內已用，registry latest `2.1.1` [VERIFIED: npm]） | transcript 仟列捲動 | 與 Phase 9 相同；`scrollToIndex` 已用於跟底 [VERIFIED: `talkie-transcript.ts`] |
| **lit** | 既有 `3.3.2` | Web Components | 專案現狀 |

### Supporting

| 套件 | 用途 | 何時用 |
|------|------|--------|
| 無額外 UI 庫 | 面板/chip/分欄 | 與 Phase 9–11 自訂 Lit 一致（CONTEXT 已說明無 Shoelace） |

### 不採用（本階段）

| 不採用 | 原因 |
|--------|------|
| Cytoscape / 圖資料庫 / D3 力導 | **OVER-05 已從本階段移出**——計畫層不應再安排拓樸實作任務。 |
| 伺服端 SQLite FTS | 屬 DASH-01/未來；本階段僅針對**已載入** transcript 視窗。 |

**Installation（供 PLAN 參考）：**

```bash
npm install minisearch@^7.2.0 -w @agent-talkie/dashboard
```

## Architecture Patterns

### 建議目錄/職責

```
packages/dashboard/src/
├── store/
│   └── dashboard-store.ts          # 延伸：篩選狀態、可選 transcript 搜尋衍生、或委派給 search 模組
├── search/                         # 可選：minisearch 封裝、文件 mapping、highlight 字串
│   └── ...
├── transcript/
│   ├── talkie-transcript.ts        # 分欄外殼、傳入「顯示用 lines」、公開捲至 dedupeKey/index
│   └── talkie-transcript-entry.ts  # 可選：搜尋高亮
├── roster/
│   └── talkie-roster.ts            # 顶部分欄 + 其餘列表
└── demo/main.ts                    # 組裝 search panel 與事件
```

### 模式 1：MiniSearch 文件模型

**內容：** 每筆 `TranscriptLine` 對應一筆文件；`id` 使用 `dedupeKey`（字串，保證唯一）  
**欄位範例（對齊 D-02）：** `sender`（roster 的 `displayName` 或回退 `sessionId` 截斷，與 `talkie-transcript-entry` 一致邏輯）、`type`（`envelope.type`）、`kind`（`envelope.kind`）、`payloadPreview`（與 `previewPayload` 相同策略的純文字，供索引） [VERIFIED: 欄位存在於 `TranscriptLine` / `Envelope`]。

**實作提示：**

- 新增行：`miniSearch.add(document)`；若同一 `dedupeKey` 理論上不重複，仍以 catch-up/append 去重邏輯為準 [VERIFIED: `appendTranscriptCatchup` / `appendTranscriptEnvelope` 使用 `transcriptDedupe`]。  
- 切換空間 `setActiveSpaceId` 已清空 `transcriptLines` [VERIFIED: `dashboard-store.ts`] → **同步 `miniSearch.removeAll()` 或重建實例**，避免跨空間索引洩漏。  

**例（API 形狀節錄，簡化）：**

```typescript
// Source: [CITED: MiniSearch README — Basic usage + search options]
import MiniSearch from "minisearch";

const ms = new MiniSearch<{ id: string; sender: string; type: string; kind: string; payloadPreview: string }>({
  fields: ["sender", "type", "payloadPreview", "kind"],
  storeFields: ["id"],
  searchOptions: { boost: { sender: 2, type: 1.5 }, prefix: true },
});

ms.add({ id: line.dedupeKey, sender: "...", type: env.type, kind: env.kind, payloadPreview: "..." });
const hits = ms.search(query, {
  filter: (r) => r.kind === "conversation" && /* time + sender 等 */,
});
```

### 模式 2：AND 篩選 +「無關鍵字」專一資料路徑

**內容：** D-09 要求無關鍵字時主 transcript 仍只顯示篩選後行。MiniSearch 在沒有查詢字串時並非自然選項；**推薦**對 `transcriptLines` 做**純陣列篩選**（同一套 predicate 與 `search` 的 `filter` 共用邏輯，避免行為分岔）。  
**有關鍵字時：** 先 `miniSearch.search(q, { filter: andPred })` 得 `id` 清單，再映射回 `TranscriptLine`；**或**全量 search 再 AND（注意效能：載入量為「已載入視窗」級別，可接受 [ASSUMED：典型 localhost 單空間行數]）。

### 模式 3：分欄與 `lit-virtualizer` 的索引契約

**內容：** 虛擬化元件的 `items` 必須是**最終**顯示陣列。篩選改變長度與序時，**點擊搜尋結果**捲動的目標必須是**該陣列內的 index**（或先 resolve `dedupeKey` → 當前陣列 index）。  
**風險：** 目前 `_scheduleScrollToBottom` 使用 `n - 1` 全量長度 [VERIFIED: `talkie-transcript.ts`]。篩選開啟後「跟底」應定義為**可見行最底**還是**仍跟隱藏但存在的最新 relay 行**——建議在 PLAN/實作中採**可見行最底**以符合操作者預期 [ASSUMED]。

**既有可複用能力：** `scrollToIndex` 與新訊息按鈕已存在；搜尋導向應採**相同 virtualizer 引用**與 rAF 型式，減少 race。

### 反模式

- **索引與 store 分離更新：** 僅在「append 行」與「空間重設」兩條路徑更新 MiniSearch，否則出現可搜尋但不可見或相反。  
- **在關注列與主列表同時顯示同一 `sessionId`：** 違反 D-10「抽出」語意。  
- **以伺服端全量歷史為前提設計客戶端搜尋：** 與本階段邊界不符；DASH-01 另案。

## Don't Hand-Roll

| 問題 | 不要自造 | 改為 | 原因 |
|------|----------|------|------|
| 倒排/模糊/權重 | 手寫 | **MiniSearch** | 邊界情況多；已有成熟 API [CITED: README] |
| 跨元件捲動 | 在 DOM 手算 scrollTop | 沿用 **virtualizer `scrollToIndex`** | 與 Phase 9 行為一致、避免虛擬化高度坑 |

**Key insight:** 本階段複雜度在**狀態合一**（索引、篩選、可見陣列、捲動目標），不在搜尋演算法。

## Common Pitfalls

### 1. 空間切換未清空搜尋索引

**現象：** 在 B 空間搜到 A 空間的 `dedupeKey` 行。  
**根因：** `setActiveSpaceId` 只清陣列，未清 MiniSearch。  
**避免：** 與 `transcriptLines` 同生命週期重建或 `removeAll()` [VERIFIED: `setActiveSpaceId` 清 `transcriptLines`]。  
**信號：** 切 space 後關鍵字仍能命中舊內容。

### 2. 篩選後 index 與 `dedupeKey` 脫鈎

**現象：** 點擊結果捲到錯行。  
**根因：** 用**未篩選**的索引捲動**篩選後**的 list。  
**避免：** 捲動前一律以 `dedupeKey` 在**當前 `items` 陣列**中解析 index。

### 3. `receivedAtMs` 與時間窗

**現象：** 時間篩選與訊息實際順序爭議。  
**根因：** catch-up/append 使用 `Date.now()` [VERIFIED: `appendTranscriptCatchup` / `appendTranscriptEnvelope`]。  
**避免：** 在 PLAN 中寫明「時間窗以**客戶端收到時間**為準」；若日後有 relay 時間欄位再遷移 [ASSUMED：本階段可接受]。

### 4. 高亮與 XSS

**現象：** 將使用者關鍵字直接 `innerHTML`。  
**避免：** 使用 Lit 的 `html` 模板字串分段或侷限於純文字節點；全文仍來自已驗證的 `Envelope` [VERIFIED: store 內 `safeParseEnvelope`]。關鍵字來自本機操作者，仍應**不**把未轉義字串當 HTML [CITED: 一般 Lit/XSS 實踐]。

## Code Examples

### 點擊結果 → virtualizer 捲動

```137:150:packages/dashboard/src/transcript/talkie-transcript.ts
  render() {
    const lines = this.store.transcriptLines;
    const showNew = this.pendingNew > 0 && !this._isPinnedToBottom;

    return html`
      <div class="head">Transcript</div>
      <lit-virtualizer
        scroller
        .items=${lines}
        .renderItem=${this._renderItem}
        .keyFunction=${this._keyFn}
        @scroll=${this._onScroll}
      ></lit-virtualizer>
```

計畫實作時應把 `lines` 換成「篩選後**且**與產品定義一致」的陣列，並新增對外公開方法（或 store 回呼）以 `scrollToIndex` 導向含 `dedupeKey` 的那一行。

### Roster 目前 blocked 排序（關注列需改為「提取」而非僅 sort）

```44:50:packages/dashboard/src/roster/talkie-roster.ts
    const sorted = [...this.entries].sort((a, b) => {
      const aBlocked = a.progress === "blocked" ? 1 : 0;
      const bBlocked = b.progress === "blocked" ? 1 : 0;
      if (aBlocked !== bBlocked) {
        return bBlocked - aBlocked;
      }
      return a.sessionId.localeCompare(b.sessionId);
    });
```

關注列上線後，一般列表應**排除** `progress === "blocked"`，或改為兩陣列：`attention` + `rest`。

## State of the Art

| 舊假設 | 本階段實情 | 影響 |
|--------|------------|------|
| Phase 12 含拓樸圖（Cytoscape 等） | 使用者已自本階段**移除** OVER-05 | ROADMAP 若仍寫圖，需與 12-CONTEXT 對齊以免誤導實作 |
| 僅以排序突出 blocked | 需獨立「Needs Attention」區塊 | `talkie-roster` 模板與樣式擴展 |

**Deprecated 於本階段：** 圖視覺化、拓樸邊重建——**不納入研究/計畫**。

## Assumptions Log

| # | 假設 | 出處 | 若錯則風險 |
|---|------|------|------------|
| A1 | 單一空間下 transcript 行數在 MiniSearch 可舒適處理範圍 | 本專案 localhost 儀表板 | 卡頓需再分段索引或虛擬化結果列 |
| A2 | 使用者接受時間窗以 `receivedAtMs`（append 時的 now）為準 | `dashboard-store` 現況 | 與實際 relay 時間有偏差時需產品決策 |

**若 A1/A2 不成立：** 在 discuss-phase 鎖邊界或加 relay 時間戳欄位（後者超出本研究範圍）。

## Open Questions

1. **ROADMAP / REQUIREMENTS 與 12-CONTEXT 的 OVER-05 敘述不一致**  
   - 已知：ROADMAP Phase 12 仍列拓樸與 Cytoscape 型計畫；REQUIREMENTS 表仍寫 OVER-05 → Phase 12。  
   - 不明：是否要在此里程碑**正式**將 OVER-05 挪到未來或改 phase 編號。  
   - 建議：在進入 12-PLAN 前用 `/gsd-discuss` 或手動補一輪**追溯表**更新，避免審查誤讀。  

2. **篩選開啟時「新訊息」鈴的行為**  
   - 需產品層面決定（僅在可見行？或全量行？）——屬 D-12 discretion，PLAN 應寫一條驗收。  

## Environment Availability

| 依賴 | 本階段需要 | 可用 | 版本 / 備註 | Fallback |
|------|------------|------|-------------|----------|
| 現代瀏覽器（ES2018+） | MiniSearch 執行 | ✓ [CITED: MiniSearch README Browser compatibility] | — | 不支援 IE |
| Vite 打包 | dashboard 建置 | ✓ | 倉內已有 | — |
| Node（開發/測試） | Vitest | ✓ | 專案既有 | — |

**無遠端服務依賴** 方可符合零預設外部服務敘事。

## Security Domain

> `workflow.nyquist_validation` 在 `.planning/config.json` 中為 `false`——不展開 Validation Architecture 小節。

| ASVS 思綯 | 適用 | 建議控制 |
|----------|------|----------|
| V5 輸入 | 是 | 搜尋關鍵字與篩選值僅作文字匹配與邏輯篩選；**Lit 模板避免未轉義 HTML 注入**（高亮） |
| V4 權限 | 低 | 本階段仍為本機儀表板，無多租戶；維持既有 relay/space 邊界即可 |

| 威脅 | 緩解 |
|------|------|
| 關鍵字 XSS | `html` + 分片字串、或純 `textContent` 節點高亮，不拼 raw HTML | 

## Sources

### Primary（HIGH）
- [VERIFIED: npm] `minisearch@7.2.0`；`@lit-labs/virtualizer@2.1.1`  
- [CITED: GitHub `lucaong/minisearch` README] — 基本用法、`search({ filter, boost, prefix, fuzzy })`、動態 add/remove、瀏覽器相容性  
- [VERIFIED: workspace] `packages/dashboard/src/store/dashboard-store.ts` — `TranscriptLine`, `RosterRow`, 重設/append 行為  
- [VERIFIED: workspace] `packages/dashboard/src/transcript/talkie-transcript.ts` — `scrollToIndex` 模式  
- [VERIFIED: workspace] `packages/dashboard/src/roster/talkie-roster.ts` — blocked 排序（將改為關注+剩餘）  
- [VERIFIED: workspace] `packages/protocol/src/envelope.ts` — `kind` / `type` schema  

### Secondary（MEDIUM）
- 專案 `ROADMAP.md` Phase 12 條文——**與 12-CONTEXT 範圍可能不一致**；以 **12-CONTEXT 為本階段鎖定決策**。

## Metadata

**Confidence breakdown:**  
- Standard stack: **HIGH**（npm + 官方 README + 倉內代碼）  
- 架構（分欄+篩選+virtualizer）: **MEDIUM**（索引與 UI 狀態邊界須在 PLAN 寫明）  
- 常見坑: **HIGH**（直接對照現有 store/transcript 行為）  

**Research date:** 2026-04-22  
**Valid until:** 約 30 日（僅在 MiniSearch 主版本升級或 transcript 儲存模型變更時重驗）  

---

*本文件刻意**不包含**拓樸圖、Cytoscape、邊圖佈局等研究（OVER-05 自本階段移除）。*
