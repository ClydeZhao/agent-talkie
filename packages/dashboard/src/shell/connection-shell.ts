import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

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
    .relay-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      color: var(--talkie-muted, #8b949e);
      font-size: 12px;
    }
    button {
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-surface, #161b22);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
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

  @property({ type: Boolean })
  relayRunning = false;

  @property({ type: Number })
  activeConnectionCount = 0;

  @property({ type: Boolean })
  stopSupported = false;

  @property({ type: Boolean })
  restartSupported = false;

  @state()
  private relayStopPending = false;

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (
      changed.has("relayRunning") &&
      this.relayStopPending &&
      !this.relayRunning
    ) {
      this.relayStopPending = false;
    }
  }

  private emitRelayStop(): void {
    this.relayStopPending = true;
    this.dispatchEvent(
      new CustomEvent("talkie-relay-stop", { bubbles: true, composed: true }),
    );
  }

  private emitRelayRestart(): void {
    this.dispatchEvent(
      new CustomEvent("talkie-relay-restart", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const dotColor = DOT_COLOR[this.healthState];
    const label = HEALTH_LABEL[this.healthState];
    const relayLabel = this.relayStopPending
      ? "Relay stopping"
      : this.relayRunning
        ? "Relay running"
        : "Relay stopped";
    return html`
      <div class="row">
        <span class="dot" style=${`background-color: ${dotColor}`}></span>
        <span>${label}</span>
      </div>
      <div class="relay-row">
        <span>${relayLabel}</span>
        <span>${this.activeConnectionCount} connections</span>
        <button
          type="button"
          data-action="stop"
          ?disabled=${!this.stopSupported || this.relayStopPending}
          @click=${this.emitRelayStop}
        >
          Stop
        </button>
        <button
          type="button"
          data-action="restart"
          ?disabled=${!this.restartSupported}
          @click=${this.emitRelayRestart}
        >
          Restart
        </button>
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
