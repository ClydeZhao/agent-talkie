import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { DashboardStore, TranscriptLine } from "../store/dashboard-store.js";

function formatHms(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

@customElement("talkie-transcript-entry")
export class TalkieTranscriptEntry extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 8px 10px;
      color: var(--talkie-fg, #e6edf3);
    }
    .system {
      color: var(--talkie-muted, #8b949e);
      font-size: 12px;
      text-align: center;
      padding: 6px 8px;
    }
    .bubble {
      max-width: min(72ch, 88%);
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 8px;
      background: var(--talkie-surface, #161b22);
      padding: 8px 10px;
      box-sizing: border-box;
    }
    .direct .bubble {
      border-color: rgba(147, 197, 253, 0.55);
    }
    .meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--talkie-muted, #8b949e);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .sender {
      color: var(--talkie-fg, #e6edf3);
      font-weight: 600;
    }
    .body {
      color: var(--talkie-fg, #e6edf3);
    }
    details.debug {
      margin-top: 4px;
      color: var(--talkie-muted, #8b949e);
      font-size: 11px;
    }
    details.debug pre {
      max-height: 220px;
      overflow: auto;
      white-space: pre-wrap;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      padding: 8px;
      background: var(--talkie-bg, #0d1117);
    }
  `;

  @property({ type: Object })
  line!: TranscriptLine;

  @property({ type: Object })
  store!: DashboardStore;

  private _senderLabel(): string {
    const env = this.line.envelope;
    const rosterRow = this.store.roster.get(env.sessionId);
    return (
      rosterRow?.displayName ??
      (env.sessionId.length > 8
        ? `${env.sessionId.slice(0, 8)}…`
        : env.sessionId)
    );
  }

  private _bodyText(): string {
    const payload = this.line.envelope.payload;
    const text = payload.text;
    if (typeof text === "string") {
      return text;
    }
    const summary = payload.summary;
    if (typeof summary === "string") {
      return summary;
    }
    return JSON.stringify(payload);
  }

  private _systemEventText(): string {
    const env = this.line.envelope;
    const sender = this._senderLabel();
    switch (env.type) {
      case "space.join":
        return `${sender} joined the space`;
      case "space.leave":
        return `${sender} left the space`;
      case "space.archive":
        return `${sender} archived the space`;
      case "space.destroy":
        return `${sender} destroyed the space`;
      case "orchestrator.designate":
        return `${sender} changed the orchestrator`;
      case "orchestrator.clear":
        return `${sender} cleared the orchestrator`;
      case "metadata.patch":
        return this._metadataPatchText(sender);
      default:
        return `${sender} sent a system event`;
    }
  }

  private _metadataPatchText(sender: string): string {
    const payload = this.line.envelope.payload;
    if (
      payload !== null &&
      typeof payload === "object" &&
      "patch" in payload &&
      payload.patch !== null &&
      typeof payload.patch === "object"
    ) {
      const patch = payload.patch as Record<string, unknown>;
      if (patch.progress === "blocked") {
        const reason =
          typeof patch.blockedReason === "string" && patch.blockedReason.trim() !== ""
            ? `: ${patch.blockedReason}`
            : "";
        return `${sender} is blocked${reason}`;
      }
      if (typeof patch.progress === "string") {
        return `${sender} is ${patch.progress}`;
      }
    }
    return `${sender} updated status`;
  }

  private _debugJson(): string {
    return JSON.stringify(this.line.envelope, null, 2);
  }

  render() {
    const env = this.line.envelope;
    const senderLabel = this._senderLabel();
    const time = formatHms(this.line.receivedAtMs);
    const directLabel = env.to !== undefined ? "Private" : "";

    if (env.kind === "control") {
      return html`
        <div class="system">
          <span>${time} · ${this._systemEventText()}</span>
          <details class="debug">
            <summary>Diagnostics</summary>
            <pre>${this._debugJson()}</pre>
          </details>
        </div>
      `;
    }

    return html`
      <div class="row ${env.to !== undefined ? "direct" : ""}">
        <div class="bubble">
          <div class="meta">
            <span class="sender">${senderLabel}</span>
            <span>${time}</span>
            ${directLabel ? html`<span>${directLabel}</span>` : null}
          </div>
          <div class="body">${this._bodyText()}</div>
          <details class="debug">
            <summary>Diagnostics</summary>
            <pre>${this._debugJson()}</pre>
          </details>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-transcript-entry": TalkieTranscriptEntry;
  }
}
