import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { RosterRow } from "../store/dashboard-store.js";
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
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--talkie-muted, #8b949e);
      border-bottom: 1px solid var(--talkie-border, #30363d);
    }
    .empty {
      padding: 16px 12px;
      font-size: 13px;
      color: var(--talkie-muted, #8b949e);
    }
  `;

  @property({ type: Array })
  entries: RosterRow[] = [];

  render() {
    const sorted = [...this.entries].sort((a, b) => {
      const aBlocked = a.progress === "blocked" ? 1 : 0;
      const bBlocked = b.progress === "blocked" ? 1 : 0;
      if (aBlocked !== bBlocked) {
        return bBlocked - aBlocked;
      }
      return a.sessionId.localeCompare(b.sessionId);
    });
    return html`
      <div class="head">Roster</div>
      ${sorted.length === 0
        ? html`<div class="empty">No members yet</div>`
        : sorted.map(
            (row) =>
              html`<talkie-roster-entry .row=${row}></talkie-roster-entry>`,
          )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-roster": TalkieRoster;
  }
}
