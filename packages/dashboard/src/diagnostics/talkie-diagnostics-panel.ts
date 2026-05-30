import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { DashboardStore, TranscriptLine } from "../store/dashboard-store.js";

function formatHms(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

@customElement("talkie-diagnostics-panel")
export class TalkieDiagnosticsPanel extends LitElement {
  static styles = css`
    :host {
      display: none;
      width: min(420px, 40vw);
      min-width: 320px;
      border-left: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-surface, #161b22);
    }
    :host([open]) {
      display: flex;
      flex-direction: column;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--talkie-border, #30363d);
    }
    .title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--talkie-muted, #8b949e);
    }
    button {
      min-height: 32px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    button:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 12px 16px;
    }
    .empty {
      color: var(--talkie-muted, #8b949e);
      font-size: 13px;
      line-height: 1.45;
    }
    .item {
      margin-bottom: 12px;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      overflow: hidden;
      background: var(--talkie-bg, #0d1117);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--talkie-border, #30363d);
      color: var(--talkie-muted, #8b949e);
      font-size: 11px;
    }
    pre {
      margin: 0;
      max-height: 260px;
      overflow: auto;
      padding: 8px;
      color: var(--talkie-fg, #e6edf3);
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media (max-width: 900px) {
      :host {
        width: 100%;
        min-width: 0;
        max-height: 42vh;
        border-left: none;
        border-top: 1px solid var(--talkie-border, #30363d);
      }
    }
  `;

  @property({ type: Object })
  store!: DashboardStore;

  @property({ type: Boolean, reflect: true })
  open = false;

  private _unsub: (() => void) | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.store) {
      this._unsub = this.store.addListener(() => {
        this.open = this.store.diagnosticsPanelOpen;
        this.requestUpdate();
      });
      this.open = this.store.diagnosticsPanelOpen;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  private _close(): void {
    this.store.setDiagnosticsPanelOpen(false);
  }

  private _renderLine(line: TranscriptLine) {
    const env = line.envelope;
    return html`
      <div class="item">
        <div class="meta">
          <span>${formatHms(line.receivedAtMs)}</span>
          <span>${env.kind}</span>
          <span>${env.type}</span>
        </div>
        <pre>${JSON.stringify(env, null, 2)}</pre>
      </div>
    `;
  }

  render() {
    if (!this.store) {
      return html``;
    }
    const lines = this.store.getDiagnosticsTranscriptLines();
    return html`
      <div class="head">
        <span class="title">Protocol Diagnostics</span>
        <button type="button" @click=${this._close}>Close</button>
      </div>
      <div class="body">
        ${lines.length === 0
          ? html`<div class="empty">No protocol envelopes loaded.</div>`
          : lines.map((line) => this._renderLine(line))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-diagnostics-panel": TalkieDiagnosticsPanel;
  }
}
