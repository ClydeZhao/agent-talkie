import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { ConnectionHealthUiState } from "../bridge/browser-session-bridge.js";

const HEALTH_LABEL: Record<ConnectionHealthUiState, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

const DOT_COLOR: Record<ConnectionHealthUiState, string> = {
  connected: "#16a34a",
  connecting: "#ca8a04",
  reconnecting: "#ca8a04",
  disconnected: "#dc2626",
};

@customElement("talkie-connection-shell")
export class TalkieConnectionShell extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 9999px;
      flex-shrink: 0;
    }
    .banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 12px;
      background: #fef3c7;
      color: #78350f;
      font-weight: 600;
      z-index: 9999;
    }
  `;

  @property({ type: String })
  healthState: ConnectionHealthUiState = "disconnected";

  @property({ type: Boolean, reflect: true })
  showRefreshBanner = false;

  @property({ type: String })
  refreshBannerText =
    "Please refresh the page to reconnect to the relay.";

  render() {
    const dotColor = DOT_COLOR[this.healthState];
    const label = HEALTH_LABEL[this.healthState];
    return html`
      <div class="row">
        <span class="dot" style=${`background-color: ${dotColor}`}></span>
        <span>${label}</span>
      </div>
      ${this.showRefreshBanner
        ? html`<div class="banner">${this.refreshBannerText}</div>`
        : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-connection-shell": TalkieConnectionShell;
  }
}
