import { LitElement, css, html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { customElement, property } from "lit/decorators.js";

import type { DashboardStore, TranscriptLine } from "../store/dashboard-store.js";

const PREVIEW_MAX = 240;

function formatHms(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function previewPayload(payload: Record<string, unknown>): string {
  const raw = JSON.stringify(payload);
  if (raw.length <= PREVIEW_MAX) {
    return raw;
  }
  return `${raw.slice(0, PREVIEW_MAX)}…`;
}

@customElement("talkie-transcript-entry")
export class TalkieTranscriptEntry extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row {
      font-size: 12px;
      line-height: 1.45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        monospace;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 2px 8px;
      color: var(--talkie-fg, #e6edf3);
    }
    .row.control {
      color: var(--talkie-muted, #8b949e);
    }
    .row.conversation {
      color: var(--talkie-fg, #e6edf3);
    }
    .row.error-type {
      color: var(--talkie-accent-danger, #f85149);
    }
  `;

  @property({ type: Object })
  line!: TranscriptLine;

  @property({ type: Object })
  store!: DashboardStore;

  render() {
    const env = this.line.envelope;
    const isErrorType = env.type.includes("error");
    const rosterRow = this.store.roster.get(env.sessionId);
    const senderLabel =
      rosterRow?.displayName ??
      (env.sessionId.length > 8
        ? `${env.sessionId.slice(0, 8)}…`
        : env.sessionId);
    const time = formatHms(this.line.receivedAtMs);
    const preview = previewPayload(env.payload);
    const lineText = `[${time}] ${senderLabel} (${env.kind} / ${env.type}): ${preview}`;

    return html`<span
      class=${classMap({
        row: true,
        control: !isErrorType && env.kind === "control",
        conversation: !isErrorType && env.kind === "conversation",
        "error-type": isErrorType,
      })}
      >${lineText}</span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-transcript-entry": TalkieTranscriptEntry;
  }
}
