import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import type {
  ParticipantProjection,
  RosterRow,
} from "../store/dashboard-store.js";

function formatLastSeen(ms: number | null): string {
  if (ms === null) {
    return "Last seen unknown";
  }
  return `Last seen ${new Date(ms).toISOString().slice(11, 19)}Z`;
}

@customElement("talkie-roster-entry")
export class TalkieRosterEntry extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    .row-wrap {
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--talkie-border, #30363d);
      box-sizing: border-box;
    }
    .row-wrap.row-wrap--blocked .row-main {
      border: 1px solid #dc2626;
      border-bottom: none;
    }
    .row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border: 0;
      box-sizing: border-box;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
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
    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
      align-items: center;
    }
    .chip {
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
    .chip--orchestrator {
      background: rgba(212, 160, 23, 0.16);
      color: #f0c15a;
    }
    .chip--owner {
      background: rgba(37, 99, 235, 0.16);
      color: #93c5fd;
    }
    .chip--self {
      background: rgba(22, 163, 74, 0.16);
      color: #86efac;
    }
    .progress-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .progress-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .progress-dot--idle {
      background: #737373;
    }
    .progress-dot--working {
      background: #16a34a;
      animation: talkie-pulse-opacity 1.2s ease-in-out infinite;
    }
    .progress-dot--blocked {
      background: #dc2626;
    }
    .progress-dot--done {
      background: #2563eb;
    }
    @keyframes talkie-pulse-opacity {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }
    .progress-label {
      font-size: 11px;
      color: var(--talkie-muted, #8b949e);
      text-transform: none;
    }
    .presence-label {
      font-size: 11px;
      color: var(--talkie-muted, #8b949e);
    }
    .presence-label--bad {
      color: var(--talkie-accent-danger, #f85149);
      font-weight: 600;
    }
    .blocked-reason {
      font-size: 11px;
      color: #f87171;
      margin-top: 4px;
      word-break: break-word;
      line-height: 1.35;
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
    .menu {
      position: relative;
      flex-shrink: 0;
      align-self: stretch;
    }
    .menu-summary {
      list-style: none;
      height: 100%;
      min-width: 36px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 10px 8px 0;
      margin: 0;
      cursor: pointer;
      color: var(--talkie-muted, #8b949e);
      font-size: 18px;
      line-height: 1;
      user-select: none;
    }
    .menu-summary::-webkit-details-marker {
      display: none;
    }
    .menu-panel {
      position: absolute;
      right: 4px;
      top: 100%;
      margin-top: -4px;
      min-width: 220px;
      background: var(--talkie-surface, #161b22);
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      padding: 6px 0;
      z-index: 30;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    }
    .menu-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 12px;
      font-size: 13px;
      line-height: 1.35;
      background: transparent;
      border: none;
      color: var(--talkie-fg, #e6edf3);
      cursor: pointer;
    }
    .menu-item:hover {
      background: var(--talkie-badge-bg, #21262d);
    }
  `;

  @property({ type: Object })
  row: RosterRow | ParticipantProjection | undefined;

  @property({ type: Boolean })
  selfIsOwner = false;

  @property({ type: String })
  selfSessionId = "";

  private _closeMenu(): void {
    const d = this.renderRoot?.querySelector("details.menu");
    if (d instanceof HTMLDetailsElement) {
      d.open = false;
    }
  }

  private _onSelectSendTarget(): void {
    const r = this.row;
    if (!r) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("talkie-select-send-target", {
        detail: { sessionId: r.sessionId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onDesignate(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const r = this.row;
    if (!r) {
      return;
    }
    this._closeMenu();
    this.dispatchEvent(
      new CustomEvent("talkie-orchestrate-designate", {
        detail: { sessionId: r.sessionId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onClear(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const r = this.row;
    if (!r) {
      return;
    }
    this._closeMenu();
    this.dispatchEvent(
      new CustomEvent("talkie-orchestrate-clear", {
        detail: { sessionId: r.sessionId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onMetadataEdit(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const r = this.row;
    if (!r) {
      return;
    }
    this._closeMenu();
    this.dispatchEvent(
      new CustomEvent("talkie-metadata-edit", {
        detail: { sessionId: r.sessionId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onRemove(ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const r = this.row;
    if (!r) {
      return;
    }
    this._closeMenu();
    this.dispatchEvent(
      new CustomEvent("talkie-membership-remove", {
        detail: { sessionId: r.sessionId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const r = this.row;
    if (!r) {
      return html``;
    }
    const prog = this._progressState(r);
    const blocked = prog === "blocked";
    const titleAttr =
      blocked && r.blockedReason.length > 0 ? r.blockedReason : nothing;
    const ownerMenu =
      this.selfIsOwner
        ? html`
            <details class="menu" @click=${(e: Event) => e.stopPropagation()}>
              <summary
                class="menu-summary"
                @click=${(e: Event) => e.stopPropagation()}
                aria-label="Session actions"
              >
                ⋯
              </summary>
              <div class="menu-panel">
                ${!r.orchestrator
                  ? html`<button
                      type="button"
                      class="menu-item"
                      @click=${this._onDesignate}
                    >
                      Designate as orchestrator
                    </button>`
                  : html`<button
                      type="button"
                      class="menu-item"
                      @click=${this._onClear}
                    >
                      Clear orchestrator
                    </button>`}
                <button
                  type="button"
                  class="menu-item metadata-edit"
                  @click=${this._onMetadataEdit}
                >
                  Edit metadata
                </button>
                ${this.selfSessionId.length > 0 &&
                  r.sessionId !== this.selfSessionId &&
                  !r.owner
                  ? html`<button
                      type="button"
                      class="menu-item"
                      @click=${this._onRemove}
                    >
                      ${r.presenceState === "stale"
                          ? "Clear stale participant"
                          : "Remove"}
                    </button>`
                  : nothing}
              </div>
            </details>
          `
        : nothing;
    return html`
      <div class="row-wrap ${blocked ? "row-wrap--blocked" : ""}">
        <button
          type="button"
          class="row-main"
          title=${titleAttr}
          @click=${this._onSelectSendTarget}
        >
          <div class="icon-wrap">
            ${r.isHuman ? this._personIcon() : this._botIcon()}
            ${r.orchestrator ? this._starIcon() : null}
          </div>
          <div class="main">
            <div class="name">${r.displayName}</div>
            <div class="chips-row">
              ${r.sessionId === this.selfSessionId
                ? html`<span class="chip chip--self">Dashboard</span>`
                : nothing}
              ${r.owner
                ? html`<span class="chip chip--owner">Owner</span>`
                : nothing}
              ${r.orchestrator
                ? html`<span class="chip chip--orchestrator"
                    >Orchestrator</span
                  >`
                : nothing}
              ${r.role
                ? html`<span class="chip">role:${r.role}</span>`
                : nothing}
              ${r.focus
                ? html`<span class="chip">${this._truncFocus(r.focus)}</span>`
                : nothing}
              <span class="progress-wrap">
                <span class="progress-dot progress-dot--${prog}"></span>
                <span class="progress-label">${prog}</span>
              </span>
	              <span class=${this._availabilityClass(r)}>
                  ${this._availabilityLabel(r)}
                </span>
	              <span class="presence-label last-seen"
	                >${formatLastSeen(r.lastSeenAtMs)}</span
	              >
	            </div>
            ${blocked && r.blockedReason.length > 0
              ? html`<div class="blocked-reason">${r.blockedReason}</div>`
              : nothing}
            <div class="meta">
              <span class="badge" title=${r.runtime}>${r.runtime}</span>
              <span class="badge" title=${r.workspaceLabel}
                >${r.workspaceLabel}</span
              >
            </div>
          </div>
        </button>
        ${ownerMenu}
      </div>
    `;
  }

  private _progressState(
    r: RosterRow | ParticipantProjection,
  ): "idle" | "working" | "blocked" | "done" {
    const p = r.progress;
    if (
      p === "idle" ||
      p === "working" ||
      p === "blocked" ||
      p === "done"
    ) {
      return p;
    }
    return "idle";
  }

  private _availabilityLabel(r: RosterRow | ParticipantProjection): string {
    if ("availability" in r) {
      return r.availability.label;
    }
    return r.presenceState;
  }

  private _availabilityClass(r: RosterRow | ParticipantProjection): string {
    if ("availability" in r) {
      return r.availability.canReceiveLive
        ? "presence-label"
        : "presence-label presence-label--bad";
    }
    return r.presenceState === "online"
      ? "presence-label"
      : "presence-label presence-label--bad";
  }

  private _truncFocus(s: string): string {
    const max = 48;
    if (s.length <= max) {
      return s;
    }
    return `${s.slice(0, max)}…`;
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
