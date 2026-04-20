import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { PropertyValues } from "lit";

import type { DashboardStore } from "../store/dashboard-store.js";

@customElement("talkie-error-bar")
export class TalkieErrorBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      flex-shrink: 0;
    }
    :host([hidden]) {
      display: none;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 0;
      border-bottom: 1px solid var(--talkie-border, #30363d);
      background: var(--talkie-surface, #161b22);
    }
    .item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      border-top: 1px solid var(--talkie-border, #30363d);
    }
    .item:first-child {
      border-top: none;
    }
    .text {
      min-width: 0;
      flex: 1;
    }
    .title {
      font-size: 13px;
      font-weight: 600;
      color: var(--talkie-accent-danger, #f85149);
      margin: 0 0 4px;
    }
    .hint {
      font-size: 12px;
      color: var(--talkie-muted, #8b949e);
      margin: 0;
      line-height: 1.45;
    }
    .actions {
      display: flex;
      flex-shrink: 0;
      align-items: flex-start;
      gap: 8px;
      margin-top: 2px;
    }
    button {
      flex-shrink: 0;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--talkie-fg, #e6edf3);
      background: var(--talkie-badge-bg, #21262d);
      border: 1px solid var(--talkie-border, #30363d);
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover {
      filter: brightness(1.08);
    }
  `;

  @property({ attribute: false })
  store: DashboardStore | undefined;

  private storeUnsub: (() => void) | undefined;

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has("store")) {
      this.storeUnsub?.();
      this.storeUnsub = undefined;
      if (this.store) {
        this.storeUnsub = this.store.addListener(() => {
          this.requestUpdate();
        });
      }
    }
    const count = this.store?.errors.length ?? 0;
    this.toggleAttribute("hidden", count === 0);
  }

  disconnectedCallback(): void {
    this.storeUnsub?.();
    this.storeUnsub = undefined;
    super.disconnectedCallback();
  }

  render() {
    const store = this.store;
    if (!store || store.errors.length === 0) {
      return html`${nothing}`;
    }
    return html`
      <div class="stack" part="stack">
        ${store.errors.map(
          (e) => html`
            <div class="item" part="item">
              <div class="text">
                <p class="title">${e.title}</p>
                <p class="hint">${e.hint}</p>
              </div>
              <div class="actions" part="actions">
                ${e.onRetry
                  ? html`<button
                      type="button"
                      part="retry"
                      @click=${() => {
                        e.onRetry?.();
                        store.dismissError(e.id);
                      }}
                    >
                      Retry
                    </button>`
                  : nothing}
                <button
                  type="button"
                  part="dismiss"
                  @click=${() => store.dismissError(e.id)}
                >
                  ${e.sticky ? "关闭" : "知道了"}
                </button>
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "talkie-error-bar": TalkieErrorBar;
  }
}
