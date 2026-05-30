import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type {
  ParticipantProjection,
  RosterRow,
} from "../store/dashboard-store.js";
import "./talkie-roster-entry.js";

@customElement("talkie-roster")
export class TalkieRoster extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 280px;
      flex-shrink: 0;
      background: var(--talkie-surface, #161b22);
      border-right: 1px solid var(--talkie-border, #30363d);
      overflow-y: auto;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--talkie-muted, #8b949e);
      border-bottom: 1px solid var(--talkie-border, #30363d);
    }
    .count {
      letter-spacing: 0;
      text-transform: none;
      font-weight: 500;
    }
    .empty {
      padding: 16px 12px;
      font-size: 13px;
      color: var(--talkie-muted, #8b949e);
    }
    .talkie-roster-attention {
      border-bottom: 1px solid var(--talkie-border, #30363d);
      background: #121820;
    }
    .attention-sub {
      padding: 8px 12px 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: none;
      color: var(--talkie-muted, #8b949e);
    }
    @media (max-width: 900px) {
      :host {
        width: 100%;
        max-height: 34vh;
        border-right: none;
      }
    }
  `;

  @property({ type: Array })
  entries: Array<RosterRow | ParticipantProjection> = [];

  @property({ type: Boolean })
  selfIsOwner = false;

  @property({ type: String })
  selfSessionId = "";

  render() {
    const blocked = this.entries.filter((r) => r.progress === "blocked");
    const rest = this.entries
      .filter((r) => r.progress !== "blocked")
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const hasAny = this.entries.length > 0;
    return html`
      <div class="head">
        <span>Participants</span>
        <span class="count">${this.entries.length}</span>
      </div>
      ${blocked.length > 0
        ? html`
            <div class="talkie-roster-attention">
              <div class="attention-sub">Needs Attention</div>
              ${blocked.map(
                (row) =>
                  html`<talkie-roster-entry
                    .row=${row}
                    .selfIsOwner=${this.selfIsOwner}
                    .selfSessionId=${this.selfSessionId}
                  ></talkie-roster-entry>`,
              )}
            </div>
          `
        : null}
      ${!hasAny
        ? html`<div class="empty">No members yet</div>`
        : rest.map(
            (row) =>
              html`<talkie-roster-entry
                .row=${row}
                .selfIsOwner=${this.selfIsOwner}
                .selfSessionId=${this.selfSessionId}
              ></talkie-roster-entry>`,
          )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-roster": TalkieRoster;
  }
}
