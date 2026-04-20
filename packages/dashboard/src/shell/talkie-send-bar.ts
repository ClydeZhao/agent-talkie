import type { Envelope } from "@agent-talkie/protocol";
import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

import type { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import type { DashboardStore } from "../store/dashboard-store.js";

@customElement("talkie-send-bar")
export class TalkieSendBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--talkie-border, #30363d);
    }
    .target-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--talkie-muted, #8b949e);
    }
    .target-label {
      font-weight: 600;
      color: var(--talkie-fg, #e6edf3);
    }
    .dismiss {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 4px;
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .dismiss:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
    .hint {
      font-size: 12px;
      color: var(--talkie-muted, #8b949e);
      margin-bottom: 8px;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    textarea {
      flex: 1;
      min-height: 44px;
      max-height: 160px;
      resize: vertical;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-surface, #161b22);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      font-size: 13px;
      line-height: 1.4;
    }
    textarea:focus {
      outline: none;
      border-color: var(--talkie-muted, #8b949e);
    }
    textarea:disabled {
      opacity: 0.55;
    }
    button.send {
      flex-shrink: 0;
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button.send:hover:not(:disabled) {
      border-color: var(--talkie-muted, #8b949e);
    }
    button.send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;

  @property({ type: Object })
  store!: DashboardStore;

  @property({ type: Object })
  bridge!: BrowserSessionBridge;

  @query("textarea")
  private _textarea!: HTMLTextAreaElement;

  private _unsubStore: (() => void) | undefined;
  private _unsubHealth: (() => void) | undefined;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubStore?.();
    this._unsubStore = undefined;
    this._unsubHealth?.();
    this._unsubHealth = undefined;
  }

  firstUpdated(): void {
    if (this.store) {
      this._unsubStore = this.store.addListener(() => this.requestUpdate());
    }
    if (this.bridge) {
      this._unsubHealth = this.bridge.onConnectionHealthChange(() =>
        this.requestUpdate(),
      );
    }
  }

  private _canSend(): boolean {
    if (this.bridge.getConnectionHealth() !== "connected") {
      return false;
    }
    if (this.bridge.getNegotiatedEnvelopeVersion() === null) {
      return false;
    }
    if (this.bridge.getRegisteredSessionId() === null) {
      return false;
    }
    if (this.store.activeSpaceId === null) {
      return false;
    }
    return true;
  }

  private _sendDisabled(): boolean {
    if (!this._canSend()) {
      return true;
    }
    if (
      this.store.sendTargetSessionId === null &&
      this.store.isDefaultOrchestratorSendBlocked
    ) {
      return true;
    }
    return false;
  }

  private _targetLabel(): string {
    const sid = this.store.sendTargetSessionId;
    if (sid === null) {
      return "To: Orchestrator";
    }
    const row = this.store.roster.get(sid);
    const name = row?.displayName ?? `${sid.slice(0, 8)}…`;
    return `To: ${name}`;
  }

  private _onDismissClick(): void {
    this.store.setSendTargetOrchestratorDefault();
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Enter") {
      return;
    }
    if (e.shiftKey) {
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }
    e.preventDefault();
    this._submit();
  }

  private _submit(): void {
    const ta = this._textarea;
    if (!ta) {
      return;
    }
    const text = ta.value.trim();
    if (text.length === 0) {
      return;
    }
    if (
      this.store.sendTargetSessionId === null &&
      this.store.isDefaultOrchestratorSendBlocked
    ) {
      return;
    }
    const version = this.bridge.getNegotiatedEnvelopeVersion();
    const sessionId = this.bridge.getRegisteredSessionId();
    const spaceId = this.store.activeSpaceId;
    if (version === null || sessionId === null || spaceId === null) {
      return;
    }
    const target = this.store.sendTargetSessionId;
    const envelope: Envelope = {
      version,
      id: crypto.randomUUID(),
      sessionId,
      kind: "conversation",
      type: target === null ? "chat.message" : "chat.direct",
      payload: { text },
      spaceId,
      idempotencyKey: crypto.randomUUID(),
      ...(target !== null ? { to: target } : {}),
    };
    this.bridge.sendEnvelope(envelope);
    ta.value = "";
  }

  render() {
    if (!this.store || !this.bridge) {
      return html``;
    }
    const showDismiss = this.store.sendTargetSessionId !== null;
    const showOrchHint =
      this.store.sendTargetSessionId === null &&
      this.store.isDefaultOrchestratorSendBlocked;

    return html`
      <div class="target-row">
        <span class="target-label">${this._targetLabel()}</span>
        ${showDismiss
          ? html`<button
              type="button"
              class="dismiss"
              aria-label="Clear direct target and send to orchestrator"
              @click=${this._onDismissClick}
            >
              ×
            </button>`
          : null}
      </div>
      ${showOrchHint
        ? html`<div class="hint">
            Designate an orchestrator to send messages
          </div>`
        : null}
      <div class="row">
        <textarea
          rows="2"
          placeholder="Message… (Shift+Enter newline, Ctrl+Enter send)"
          ?disabled=${!this._canSend()}
          @keydown=${this._onKeyDown}
        ></textarea>
        <button
          type="button"
          class="send"
          ?disabled=${this._sendDisabled()}
          @click=${() => this._submit()}
        >
          Send
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-send-bar": TalkieSendBar;
  }
}
