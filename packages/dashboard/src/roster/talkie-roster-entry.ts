import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { RosterRow } from "../store/dashboard-store.js";

@customElement("talkie-roster-entry")
export class TalkieRosterEntry extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--talkie-border, #30363d);
    }
    .icon-wrap {
      position: relative;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
    }
    .icon {
      width: 28px;
      height: 28px;
      color: var(--talkie-muted, #8b949e);
    }
    .orch-badge {
      position: absolute;
      right: -4px;
      bottom: -2px;
      width: 14px;
      height: 14px;
      color: #d4a017;
    }
    .main {
      flex: 1;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      font-size: 13px;
      line-height: 1.3;
      word-break: break-word;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
      align-items: center;
    }
    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-muted, #8b949e);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  @property({ type: Object })
  row: RosterRow | undefined;

  render() {
    const r = this.row;
    if (!r) {
      return html``;
    }
    return html`
      <div class="row">
        <div class="icon-wrap">
          ${r.isHuman ? this._personIcon() : this._botIcon()}
          ${r.orchestrator ? this._starIcon() : null}
        </div>
        <div class="main">
          <div class="name">${r.displayName}</div>
          <div class="meta">
            <span class="badge" title=${r.runtime}>${r.runtime}</span>
            <span class="badge" title=${r.workspaceLabel}>${r.workspaceLabel}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _personIcon() {
    return html`
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4Z"
          fill="currentColor"
        />
      </svg>
    `;
  }

  private _botIcon() {
    return html`
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 3h6v2h3a2 2 0 0 1 2 2v3h-2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10H4V7a2 2 0 0 1 2-2h3V3Zm1 2v1h4V5h-4ZM8 8H7v2h14V8h-1H8Zm1 4v7h10v-7H9Z"
          fill="currentColor"
        />
      </svg>
    `;
  }

  private _starIcon() {
    return html`
      <svg
        class="orch-badge"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Orchestrator"
      >
        <path
          d="M12 2l2.4 7.4h7.8l-6.3 4.6 2.4 7.4L12 16.8l-6.3 4.6 2.4-7.4L2.8 9.4h7.6L12 2z"
        />
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-roster-entry": TalkieRosterEntry;
  }
}
