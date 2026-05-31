import { metadataPatchPayloadSchema, type Envelope } from "@agent-talkie/protocol";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import type { RosterRow } from "../store/dashboard-store.js";

type Progress = "idle" | "working" | "blocked" | "done";

@customElement("talkie-metadata-editor")
export class TalkieMetadataEditor extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(1, 4, 9, 0.68);
    }
    dialog {
      width: min(520px, 100%);
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 8px;
      padding: 0;
      color: var(--talkie-text, #e6edf3);
      background: var(--talkie-surface, #161b22);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
    }
    form {
      display: grid;
      gap: 14px;
      padding: 16px;
    }
    header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.3;
    }
    .runtime {
      margin-top: 3px;
      color: var(--talkie-muted, #8b949e);
      font-size: 12px;
    }
    .grid {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
    }
    label {
      display: grid;
      gap: 5px;
      font-size: 12px;
      color: var(--talkie-muted, #8b949e);
    }
    input,
    select,
    textarea {
      min-width: 0;
      box-sizing: border-box;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      padding: 8px 9px;
      color: var(--talkie-text, #e6edf3);
      background: var(--talkie-bg, #0d1117);
      font: inherit;
    }
    textarea {
      min-height: 72px;
      resize: vertical;
    }
    .wide {
      grid-column: 1 / -1;
    }
    footer {
      display: flex;
      justify-content: end;
      gap: 8px;
    }
    button {
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--talkie-text, #e6edf3);
      background: var(--talkie-bg, #0d1117);
      cursor: pointer;
    }
    button.primary {
      border-color: #2f81f7;
      background: #1f6feb;
      color: white;
    }
    @media (max-width: 560px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  @property({ type: Boolean })
  open = false;

  @property({ type: Object })
  row: RosterRow | null = null;

  @property({ type: String })
  spaceId = "";

  @property({ attribute: false })
  bridge: Pick<
    BrowserSessionBridge,
    "getNegotiatedEnvelopeVersion" | "getRegisteredSessionId" | "sendEnvelope"
  > | null = null;

  private _close(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("talkie-metadata-editor-close", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _submit(ev: Event): void {
    ev.preventDefault();
    const row = this.row;
    const bridge = this.bridge;
    const version = bridge?.getNegotiatedEnvelopeVersion() ?? null;
    const sessionId = bridge?.getRegisteredSessionId() ?? null;
    if (!row || !bridge || version === null || sessionId === null || !this.spaceId) {
      return;
    }

    const form = ev.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const role = String(data.get("role") ?? "").trim();
    const focus = String(data.get("focus") ?? "").trim();
    const progress = String(data.get("progress") ?? "idle") as Progress;
    const blockedReason = String(data.get("blockedReason") ?? "").trim();

    const profilePatch = { role, focus };
    const statusPatch = { progress, blockedReason };

    if (role !== row.role || focus !== row.focus) {
      const payload = metadataPatchPayloadSchema.parse({
        namespace: "profile",
        targetSessionId: row.sessionId,
        patch: profilePatch,
      });
      bridge.sendEnvelope(this._envelope(version, sessionId, payload));
    }

    if (
      progress !== row.progress ||
      blockedReason !== row.blockedReason
    ) {
      const payload = metadataPatchPayloadSchema.parse({
        namespace: "status",
        targetSessionId: row.sessionId,
        patch: statusPatch,
      });
      bridge.sendEnvelope(this._envelope(version, sessionId, payload));
    }

    this._close();
  }

  private _envelope(
    version: number,
    sessionId: string,
    payload: Envelope["payload"],
  ): Envelope {
    return {
      version,
      id: crypto.randomUUID(),
      sessionId,
      kind: "control",
      type: "metadata.patch",
      payload,
      idempotencyKey: crypto.randomUUID(),
      spaceId: this.spaceId,
    };
  }

  render() {
    if (!this.open || !this.row) {
      return nothing;
    }
    const row = this.row;
    return html`
      <div class="backdrop" @click=${this._close}>
        <dialog open @click=${(ev: Event) => ev.stopPropagation()}>
          <form @submit=${this._submit}>
            <header>
              <div>
                <h2>${row.displayName}</h2>
                <div class="runtime">${row.runtime} · ${row.workspaceLabel}</div>
              </div>
              <button type="button" @click=${this._close} aria-label="Close">
                Close
              </button>
            </header>
            <div class="grid">
              <label>
                Role
                <input name="role" maxlength="256" .value=${row.role} />
              </label>
              <label>
                Progress
                <select name="progress" .value=${row.progress}>
                  <option value="idle">idle</option>
                  <option value="working">working</option>
                  <option value="blocked">blocked</option>
                  <option value="done">done</option>
                </select>
              </label>
              <label class="wide">
                Focus
                <input name="focus" maxlength="512" .value=${row.focus} />
              </label>
              <label class="wide">
                Blocked reason
                <textarea
                  name="blockedReason"
                  maxlength="512"
                  .value=${row.blockedReason}
                ></textarea>
              </label>
            </div>
            <footer>
              <button type="button" @click=${this._close}>Cancel</button>
              <button class="primary" type="submit">Save</button>
            </footer>
          </form>
        </dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-metadata-editor": TalkieMetadataEditor;
  }
}
