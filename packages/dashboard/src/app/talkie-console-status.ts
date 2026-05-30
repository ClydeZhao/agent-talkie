import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { DashboardStore } from "../store/dashboard-store.js";

@customElement("talkie-console-status")
export class TalkieConsoleStatus extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1 1 360px;
      min-width: 280px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .item {
      min-width: 0;
      padding: 7px 9px;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      background: var(--talkie-bg, #0d1117);
    }
    .label {
      display: block;
      margin-bottom: 3px;
      color: var(--talkie-muted, #8b949e);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .value {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--talkie-fg, #e6edf3);
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .value--bad {
      color: var(--talkie-accent-danger, #f85149);
    }
    .sub {
      display: block;
      margin-top: 2px;
      overflow: hidden;
      color: var(--talkie-muted, #8b949e);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 760px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  @property({ type: Object })
  store!: DashboardStore;

  private _unsub: (() => void) | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.store) {
      this._unsub = this.store.addListener(() => this.requestUpdate());
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
  }

  render() {
    if (!this.store) {
      return html``;
    }
    const projection = this.store.getConsoleProjection();
    const defaultDiscussion = projection.defaultDiscussion;
    const actionable = defaultDiscussion.canSend && projection.space.status === "active";
    return html`
      <div class="grid" aria-label="Dashboard state">
        <div class="item">
          <span class="label">Space</span>
          <span class="value">${projection.space.label}</span>
          <span class="sub">${projection.space.status}</span>
        </div>
        <div class="item">
          <span class="label">Orchestrator</span>
          <span
            class=${`value ${projection.orchestrator === null ? "value--bad" : ""}`}
          >
            ${projection.orchestrator?.displayName ?? "Missing"}
          </span>
          <span class="sub">
            ${projection.orchestrator?.availability.label ??
            "Default discussion blocked"}
          </span>
        </div>
        <div class="item">
          <span class="label">Send Target</span>
          <span class=${`value ${actionable ? "" : "value--bad"}`}>
            ${defaultDiscussion.targetLabel}
          </span>
          <span class="sub">
            ${actionable ? "Ready" : defaultDiscussion.reason}
          </span>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-console-status": TalkieConsoleStatus;
  }
}
