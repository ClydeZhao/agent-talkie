import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import {
  type DashboardStore,
  type TranscriptLine,
  type TranscriptTimeFilter,
} from "../store/dashboard-store.js";
import { previewPayload } from "../transcript/payload-preview.js";

const SEARCH_DEBOUNCE_MS = 500;

function formatReceivedTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function timeFilterToMode(tf: TranscriptTimeFilter): "all" | "5m" | "30m" | "custom" {
  if (tf.kind === "all") {
    return "all";
  }
  if (tf.kind === "preset") {
    return tf.preset === "5m" ? "5m" : "30m";
  }
  return "custom";
}

function localInputFromMs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

@customElement("talkie-search-panel")
export class TalkieSearchPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      /* 320–400px column (D-04) */
      width: 360px;
      min-width: 0;
      min-height: 0;
      flex-shrink: 0;
      box-sizing: border-box;
      border-left: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-surface, #161b22);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px 6px;
      border-bottom: 1px solid var(--talkie-border, #30363d);
      min-height: 0;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      max-width: 100%;
    }
    .chip button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0;
      margin: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--talkie-muted, #8b949e);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .chip button:hover {
      color: var(--talkie-fg, #e6edf3);
    }
    .panel-main {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      padding: 8px 10px 10px;
      gap: 8px;
    }
    .search-input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-bg, #0d1117);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      font-size: 13px;
    }
    .search-input:focus {
      outline: none;
      border-color: var(--talkie-muted, #8b949e);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .row label {
      font-size: 11px;
      color: var(--talkie-muted, #8b949e);
      min-width: 40px;
    }
    .row select,
    .row button.apply {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
    }
    .row select:focus,
    .row button.apply:focus {
      outline: none;
      border-color: var(--talkie-muted, #8b949e);
    }
    .row button.apply {
      cursor: pointer;
      font-weight: 600;
    }
    .row button.apply:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
    .custom-time {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    }
    .custom-time span {
      font-size: 11px;
      color: var(--talkie-muted, #8b949e);
    }
    .custom-time input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      font-size: 12px;
      border-radius: 4px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-bg, #0d1117);
      color: var(--talkie-fg, #e6edf3);
    }
    .results {
      flex: 1;
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      background: var(--talkie-bg, #0d1117);
    }
    .result-line {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 10px;
      border: none;
      border-bottom: 1px solid var(--talkie-border, #30363d);
      background: transparent;
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
      cursor: pointer;
    }
    .result-line:hover {
      background: var(--talkie-badge-bg, #21262d);
    }
    .result-line:last-child {
      border-bottom: none;
    }
    .r-meta {
      display: block;
      font-size: 11px;
      color: var(--talkie-muted, #8b949e);
      margin-bottom: 2px;
    }
    .r-payload {
      display: block;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .empty-hint {
      padding: 12px 10px;
      font-size: 12px;
      color: var(--talkie-muted, #8b949e);
    }
  `;

  @property({ type: Object })
  store!: DashboardStore;

  @state()
  private _queryDraft = "";

  @state()
  private _timeMode: "all" | "5m" | "30m" | "custom" = "all";

  @state()
  private _customStart = "";

  @state()
  private _customEnd = "";

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _unsub: (() => void) | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    this._queryDraft = this.store.transcriptSearchQuery;
    this._syncTimeUiFromStore();
    this._unsub = this.store.addListener(() => {
      this._queryDraft = this.store.transcriptSearchQuery;
      this._syncTimeUiFromStore();
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  private _syncTimeUiFromStore(): void {
    const tf = this.store.transcriptTimeFilter;
    this._timeMode = timeFilterToMode(tf);
    if (tf.kind === "custom") {
      this._customStart = localInputFromMs(tf.startMs);
      this._customEnd = localInputFromMs(tf.endMs);
    }
  }

  private _onQueryInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this._queryDraft = v;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = null;
      this.store.setTranscriptSearchQuery(this._queryDraft);
    }, SEARCH_DEBOUNCE_MS);
  }

  private _onQueryBlur(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this.store.setTranscriptSearchQuery(this._queryDraft);
  }

  private _rosterOptions() {
    return Array.from(this.store.roster.values()).sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    );
  }

  private _senderLabel(sessionId: string): string {
    return this.store.roster.get(sessionId)?.displayName ?? sessionId;
  }

  private _onSenderChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.store.setTranscriptFilters({
      sender: v === "" ? null : v,
    });
  }

  private _onKindChange(e: Event): void {
    const v = (e.target as HTMLSelectElement)
      .value as "all" | "control" | "conversation";
    this.store.setTranscriptFilters({ kind: v });
  }

  private _onTimeModeChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value as
      | "all"
      | "5m"
      | "30m"
      | "custom";
    this._timeMode = v;
    if (v === "all") {
      this.store.setTranscriptFilters({ time: { kind: "all" } });
    } else if (v === "5m" || v === "30m") {
      this.store.setTranscriptFilters({
        time: { kind: "preset", preset: v },
      });
    } else {
      if (this._customStart === "" || this._customEnd === "") {
        const end = Date.now();
        const start = end - 60 * 60 * 1000;
        this._customStart = localInputFromMs(start);
        this._customEnd = localInputFromMs(end);
      }
      this._applyCustomTimeFromInputs();
    }
  }

  private _parseLocalInputToMs(s: string): number | null {
    if (s.trim() === "") {
      return null;
    }
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : null;
  }

  private _applyCustomTimeFromInputs(): void {
    const a = this._parseLocalInputToMs(this._customStart);
    const b = this._parseLocalInputToMs(this._customEnd);
    if (a === null || b === null) {
      return;
    }
    const startMs = Math.min(a, b);
    const endMs = Math.max(a, b);
    this.store.setTranscriptFilters({
      time: { kind: "custom", startMs, endMs },
    });
  }

  private _onCustomStartInput(e: Event): void {
    this._customStart = (e.target as HTMLInputElement).value;
    this._timeMode = "custom";
    this._applyCustomTimeFromInputs();
  }

  private _onCustomEndInput(e: Event): void {
    this._customEnd = (e.target as HTMLInputElement).value;
    this._timeMode = "custom";
    this._applyCustomTimeFromInputs();
  }

  private _removeSenderChip(): void {
    this.store.setTranscriptFilters({ sender: null });
  }

  private _removeKindChip(): void {
    this.store.setTranscriptFilters({ kind: "all" });
  }

  private _removeTimeChip(): void {
    this._timeMode = "all";
    this.store.setTranscriptFilters({ time: { kind: "all" } });
  }

  private _chips() {
    const chips: ReturnType<typeof html>[] = [];
    const sid = this.store.transcriptFilterSenderSessionId;
    if (sid !== null) {
      chips.push(html`
        <span class="chip" title="Sender filter"
          >发件人: ${this._senderLabel(sid)}
          <button
            type="button"
            aria-label="Remove sender filter"
            @click=${this._removeSenderChip}
          >
            ×
          </button>
        </span>
      `);
    }
    const k = this.store.transcriptFilterKind;
    if (k !== "all") {
      chips.push(html`
        <span class="chip" title="Kind filter"
          >类型: ${k}
          <button
            type="button"
            aria-label="Remove kind filter"
            @click=${this._removeKindChip}
          >
            ×
          </button>
        </span>
      `);
    }
    const tf = this.store.transcriptTimeFilter;
    if (tf.kind !== "all") {
      let label = "";
      if (tf.kind === "preset") {
        label = tf.preset === "5m" ? "近 5 分钟" : "近 30 分钟";
      } else {
        label = `自訂 ${new Date(tf.startMs).toLocaleString()} – ${new Date(
          tf.endMs,
        ).toLocaleString()}`;
      }
      chips.push(html`
        <span class="chip" title="Time filter"
          >时间: ${label}
          <button
            type="button"
            aria-label="Remove time filter"
            @click=${this._removeTimeChip}
          >
            ×
          </button>
        </span>
      `);
    }
    return chips;
  }

  private _payloadSummary(line: TranscriptLine): string {
    return previewPayload(
      line.envelope.payload as unknown as Record<string, unknown>,
    );
  }

  private _onResultClick(line: TranscriptLine): void {
    this.dispatchEvent(
      new CustomEvent("talkie-jump-to-dedupe", {
        detail: { dedupeKey: line.dedupeKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const lines = this.store.getVisibleTranscriptLines();
    const roster = this._rosterOptions();
    const senderVal = this.store.transcriptFilterSenderSessionId ?? "";
    const kindVal = this.store.transcriptFilterKind;
    const timeSelectVal = this._timeMode;

    return html`
      <div class="chips">${this._chips()}</div>
      <div class="panel-main">
        <input
          class="search-input"
          type="search"
          placeholder="搜索…"
          .value=${this._queryDraft}
          @input=${this._onQueryInput}
          @blur=${this._onQueryBlur}
        />
        <div class="row">
          <label for="t-sender">发件人</label>
          <select
            id="t-sender"
            @change=${this._onSenderChange}
            .value=${senderVal}
          >
            <option value="">（任何）</option>
            ${roster.map(
              (r) =>
                html`<option value=${r.sessionId}>${r.displayName}</option>`,
            )}
          </select>
        </div>
        <div class="row">
          <label for="t-kind">类型</label>
          <select id="t-kind" @change=${this._onKindChange} .value=${kindVal}>
            <option value="all">全部</option>
            <option value="control">control</option>
            <option value="conversation">conversation</option>
          </select>
        </div>
        <div class="row">
          <label for="t-time">时间</label>
          <select
            id="t-time"
            @change=${this._onTimeModeChange}
            .value=${timeSelectVal}
          >
            <option value="all">全部</option>
            <option value="5m">近 5 分钟</option>
            <option value="30m">近 30 分钟</option>
            <option value="custom">自訂时间窗</option>
          </select>
        </div>
        ${timeSelectVal === "custom"
          ? html`
              <div class="custom-time">
                <span>自訂起</span>
                <input
                  type="datetime-local"
                  .value=${this._customStart}
                  @input=${this._onCustomStartInput}
                />
                <span>自訂迄</span>
                <input
                  type="datetime-local"
                  .value=${this._customEnd}
                  @input=${this._onCustomEndInput}
                />
                <button
                  type="button"
                  class="apply"
                  @click=${this._applyCustomTimeFromInputs}
                >
                  应用时间窗
                </button>
              </div>
            `
          : null}
        <div class="results">
          ${lines.length === 0
            ? html`<div class="empty-hint">无匹配行（调整筛选或关键字）。</div>`
            : lines.map(
                (line) => html`
                  <button
                    type="button"
                    class="result-line"
                    @click=${() => this._onResultClick(line)}
                  >
                    <span class="r-meta"
                      >${formatReceivedTime(line.receivedAtMs)} ·
                      ${this._senderLabel(line.envelope.sessionId)} ·
                      ${line.envelope.kind}/${line.envelope.type}</span
                    >
                    <span class="r-payload">${this._payloadSummary(line)}</span>
                  </button>
                `,
              )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-search-panel": TalkieSearchPanel;
  }
}
