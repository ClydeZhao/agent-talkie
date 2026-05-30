import "@lit-labs/virtualizer";

import { LitVirtualizer } from "@lit-labs/virtualizer/LitVirtualizer.js";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { DashboardStore, TranscriptLine } from "../store/dashboard-store.js";
import "./talkie-transcript-entry.js";

const PIN_THRESHOLD_PX = 48;

@customElement("talkie-transcript")
export class TalkieTranscript extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      position: relative;
    }
    .head {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .head-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--talkie-muted, #8b949e);
    }
    .search-toggle {
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      cursor: pointer;
    }
    .search-toggle:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
    lit-virtualizer {
      flex: 1;
      min-height: 0;
      display: block;
    }
    .new-msg {
      position: absolute;
      bottom: 16px;
      right: 16px;
      z-index: 1;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--talkie-fg, #e6edf3);
      background: var(--talkie-badge-bg, #21262d);
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
    .new-msg:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
  `;

  @property({ type: Object })
  store!: DashboardStore;

  @state()
  private pendingNew = 0;

  private _isPinnedToBottom = true;
  private _prevLen = 0;
  private _unsub: (() => void) | undefined;

  private readonly _renderItem = (item: TranscriptLine) => html`
    <talkie-transcript-entry .line=${item} .store=${this.store}></talkie-transcript-entry>
  `;

  private readonly _keyFn = (item: TranscriptLine) => item.dedupeKey;

  connectedCallback(): void {
    super.connectedCallback();
    this._prevLen = this.store.getVisibleTranscriptLines().length;
    this._unsub = this.store.addListener(() => this._onStoreNotify());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  private _onStoreNotify(): void {
    const len = this.store.getVisibleTranscriptLines().length;
    const delta = len - this._prevLen;
    if (delta > 0) {
      if (this._isPinnedToBottom) {
        this._scheduleScrollToBottom();
      } else {
        this.pendingNew += delta;
      }
      this._prevLen = len;
      this.requestUpdate();
      return;
    }
    if (delta < 0) {
      this._prevLen = len;
      this.pendingNew = 0;
      this.requestUpdate();
      return;
    }
    // Same length: filters/search may still change visible line contents (D-09).
    this.requestUpdate();
  }

  private _scheduleScrollToBottom(): void {
    requestAnimationFrame(() => {
      const v = this.renderRoot.querySelector(
        "lit-virtualizer",
      ) as LitVirtualizer | null;
      const n = this.store.getVisibleTranscriptLines().length;
      if (v && n > 0) {
        v.scrollToIndex(n - 1, "end");
      }
    });
  }

  private _onScroll(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD_PX;
    const prevPending = this.pendingNew;
    this._isPinnedToBottom = nearBottom;
    if (nearBottom) {
      this.pendingNew = 0;
    }
    if (prevPending !== this.pendingNew || nearBottom) {
      this.requestUpdate();
    }
  }

  private _jumpToBottom(): void {
    this.pendingNew = 0;
    this._isPinnedToBottom = true;
    this._scheduleScrollToBottom();
    this.requestUpdate();
  }

  private _toggleSearchPanel(): void {
    this.store.setTranscriptSearchPanelOpen(!this.store.transcriptSearchPanelOpen);
  }

  scrollToDedupeKey(dedupeKey: string): void {
    const lines = this.store.getVisibleTranscriptLines();
    const index = lines.findIndex((l) => l.dedupeKey === dedupeKey);
    if (index < 0) {
      return;
    }
    requestAnimationFrame(() => {
      const v = this.renderRoot.querySelector(
        "lit-virtualizer",
      ) as LitVirtualizer | null;
      v?.scrollToIndex(index, "end");
      this.requestUpdate();
    });
  }

  render() {
    const showNew = this.pendingNew > 0 && !this._isPinnedToBottom;

    return html`
      <div class="head">
        <span class="head-title">Transcript</span>
        <button
          type="button"
          class="search-toggle"
          aria-label="Search transcript"
          @click=${this._toggleSearchPanel}
        >
          搜索
        </button>
      </div>
      <lit-virtualizer
        scroller
        .items=${this.store.getVisibleTranscriptLines()}
        .renderItem=${this._renderItem}
        .keyFunction=${this._keyFn}
        @scroll=${this._onScroll}
      ></lit-virtualizer>
      ${showNew
        ? html`<button
            type="button"
            class="new-msg"
            @click=${this._jumpToBottom}
          >
            ↓ ${this.pendingNew} 新消息
          </button>`
        : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-transcript": TalkieTranscript;
  }
}
