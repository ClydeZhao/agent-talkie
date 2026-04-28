import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import type { DashboardStore, SpaceListRow } from "../store/dashboard-store.js";

/**
 * Must match `normalizeSpaceSlug` / persistence slug rules
 * (`packages/persistence/src/repositories/spaces.ts`).
 */
const SLUG_MAX_LEN = 64;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidSlug(s: string): boolean {
  return s.length > 0 && s.length <= SLUG_MAX_LEN && SLUG_PATTERN.test(s);
}

function dashboardUrlWithSpace(slug: string): string {
  const base = new URL("/dashboard", location.origin);
  base.searchParams.set("space", slug);
  return base.href;
}

@customElement("talkie-space-picker")
export class TalkieSpacePicker extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      font-size: 13px;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      cursor: pointer;
      max-width: 220px;
    }
    .trigger:hover {
      border-color: var(--talkie-muted, #8b949e);
    }
    .chev {
      font-size: 10px;
      color: var(--talkie-muted, #8b949e);
    }
    .panel {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      min-width: 260px;
      max-height: 320px;
      overflow: auto;
      z-index: 50;
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 8px;
      background: var(--talkie-surface, #161b22);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    .row {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: var(--talkie-fg, #e6edf3);
      cursor: pointer;
      font: inherit;
    }
    .row:hover {
      background: var(--talkie-badge-bg, #21262d);
    }
    .row.current {
      font-weight: 600;
      color: var(--talkie-muted, #8b949e);
    }
    .footer {
      border-top: 1px solid var(--talkie-border, #30363d);
      padding: 8px 12px;
    }
    .create-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--talkie-muted, #8b949e);
      margin-bottom: 6px;
    }
    .create-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .create-row input {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-bg, #0d1117);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
    }
    .create-row button,
    .destroy-btn {
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-badge-bg, #21262d);
      color: var(--talkie-fg, #e6edf3);
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .destroy-btn {
      margin-top: 8px;
      border-color: var(--talkie-accent-danger, #f85149);
      color: var(--talkie-accent-danger, #f85149);
    }
    .err {
      font-size: 12px;
      color: var(--talkie-accent-danger, #f85149);
      margin-top: 6px;
    }
    .banner {
      font-size: 12px;
      color: var(--talkie-accent-danger, #f85149);
      margin-top: 6px;
      padding: 6px 0;
    }
  `;

  @property({ type: Object })
  store: DashboardStore | null = null;

  @property({ type: Object })
  bridge: BrowserSessionBridge | null = null;

  @property({ type: String })
  httpOrigin = "";

  @property({ type: String })
  currentSlug = "";

  @property({ type: Boolean })
  selfIsOwner = false;

  @property({ type: String, attribute: false })
  destroyedSlug: string | null = null;

  @state()
  private open = false;

  @state()
  private createExpanded = false;

  @state()
  private createInput = "";

  @state()
  private fetchError: string | null = null;

  @state()
  private createError: string | null = null;

  private onDocClick = (ev: MouseEvent): void => {
    if (!this.open) {
      return;
    }
    const path = ev.composedPath();
    if (!path.includes(this)) {
      this.open = false;
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.onDocClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("click", this.onDocClick);
  }

  private togglePanel(ev: Event): void {
    ev.stopPropagation();
    this.open = !this.open;
    if (this.open) {
      void this.refreshSpaces();
    }
  }

  private async refreshSpaces(): Promise<void> {
    this.fetchError = null;
    if (!this.httpOrigin) {
      return;
    }
    try {
      const res = await fetch(
        `${this.httpOrigin}/__agent-talkie/v1/oversight/spaces`,
      );
      if (res.status !== 200) {
        this.fetchError = `List failed (${res.status})`;
        return;
      }
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        this.fetchError = "Invalid list response";
        return;
      }
      const rows: SpaceListRow[] = data.map((raw) => {
        const o = raw as Record<string, unknown>;
        return {
          slug: String(o.slug ?? ""),
          memberCount: Number(o.memberCount ?? 0),
          ownerSessionId:
            o.ownerSessionId === null || o.ownerSessionId === undefined
              ? null
              : String(o.ownerSessionId),
          orchestratorSessionId:
            o.orchestratorSessionId === null ||
            o.orchestratorSessionId === undefined
              ? null
              : String(o.orchestratorSessionId),
        };
      });
      this.store?.setSpacesList(rows);
    } catch {
      this.fetchError = "Network error";
    }
  }

  private pickSpace(slug: string, ev: Event): void {
    ev.stopPropagation();
    if (slug === this.currentSlug) {
      this.open = false;
      return;
    }
    window.open(
      dashboardUrlWithSpace(slug),
      "_blank",
      "noopener,noreferrer",
    );
    this.open = false;
  }

  private confirmCreate(ev: Event): void {
    ev.stopPropagation();
    this.createError = null;
    const slug = this.createInput.trim().toLowerCase();
    if (!isValidSlug(slug)) {
      this.createError = `Invalid slug (pattern, max ${SLUG_MAX_LEN})`;
      return;
    }
    window.open(
      dashboardUrlWithSpace(slug),
      "_blank",
      "noopener,noreferrer",
    );
    this.createInput = "";
    this.createExpanded = false;
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("talkie-space-refresh", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onDestroy(ev: Event): void {
    ev.stopPropagation();
    const slug = this.currentSlug;
    if (
      !this.selfIsOwner ||
      !this.bridge ||
      !this.store?.activeSpaceId ||
      !slug
    ) {
      return;
    }
    if (
      !window.confirm(
        `Destroy space "${slug}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    this.bridge.sendSpaceDestroy({
      spaceId: this.store.activeSpaceId,
      slug,
      idempotencyKey: crypto.randomUUID(),
    });
    this.open = false;
  }

  render() {
    const destroyed = this.destroyedSlug;
    return html`
      <div>
        <button
          type="button"
          class="trigger"
          @click=${this.togglePanel}
          aria-expanded=${this.open}
        >
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            >${this.currentSlug || "—"}</span
          >
          <span class="chev">${this.open ? "▲" : "▼"}</span>
        </button>
        ${destroyed
          ? html`<div class="banner">Space was destroyed: ${destroyed}</div>`
          : null}
        ${this.open
          ? html`
              <div class="panel" @click=${(e: Event) => e.stopPropagation()}>
                ${this.fetchError
                  ? html`<div class="err">${this.fetchError}</div>`
                  : null}
                ${(this.store?.spacesList ?? []).map(
                  (r) => html`
                    <button
                      type="button"
                      class="row ${r.slug === this.currentSlug
                        ? "current"
                        : ""}"
                      @click=${(e: Event) => this.pickSpace(r.slug, e)}
                    >
                      ${r.slug}
                      <span style="color:var(--talkie-muted,#8b949e)"
                        >(${r.memberCount})</span
                      >
                    </button>
                  `,
                )}
                ${this.selfIsOwner
                  ? html`
                      <button
                        type="button"
                        class="row destroy-btn"
                        @click=${this.onDestroy}
                      >
                        Destroy
                      </button>
                    `
                  : null}
                <div class="footer">
                  <div class="create-label">Create new space</div>
                  ${!this.createExpanded
                    ? html`
                        <button
                          type="button"
                          class="row"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this.createExpanded = true;
                          }}
                        >
                          Create new space…
                        </button>
                      `
                    : html`
                        <div class="create-row">
                          <input
                            type="text"
                            .value=${this.createInput}
                            @input=${(e: Event) => {
                              this.createInput = (
                                e.target as HTMLInputElement
                              ).value;
                            }}
                            placeholder="new-space-slug"
                            aria-label="New space slug"
                          />
                          <button type="button" @click=${this.confirmCreate}>
                            Join
                          </button>
                        </div>
                        ${this.createError
                          ? html`<div class="err">${this.createError}</div>`
                          : null}
                      `}
                </div>
              </div>
            `
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-space-picker": TalkieSpacePicker;
  }
}
