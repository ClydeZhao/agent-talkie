// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import "./connection-shell.js";

describe("TalkieConnectionShell", () => {
  it("renders Connected label when healthState is connected", async () => {
    const el = document.createElement("talkie-connection-shell");
    (el as HTMLElement & { healthState: string }).healthState = "connected";
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.shadowRoot?.textContent).toContain("Connected");
  });

  it("renders relay status, connection count, and emits stop requests", async () => {
    const el = document.createElement("talkie-connection-shell") as HTMLElement & {
      relayRunning: boolean;
      activeConnectionCount: number;
      stopSupported: boolean;
      restartSupported: boolean;
    };
    el.relayRunning = true;
    el.activeConnectionCount = 2;
    el.stopSupported = true;
    el.restartSupported = true;
    const stopEvents: Event[] = [];
    const restartEvents: Event[] = [];
    el.addEventListener("talkie-relay-stop", (ev) => stopEvents.push(ev));
    el.addEventListener("talkie-relay-restart", (ev) => restartEvents.push(ev));

    document.body.appendChild(el);
    await Promise.resolve();

    expect(el.shadowRoot?.textContent).toContain("Relay running");
    expect(el.shadowRoot?.textContent).toContain("2 connections");
    const stop = el.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-action="stop"]',
    );
    expect(stop?.disabled).toBe(false);
    stop?.click();
    expect(stopEvents).toHaveLength(1);

    const restart = el.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-action="restart"]',
    );
    expect(restart?.disabled).toBe(false);
    restart?.click();
    expect(restartEvents).toHaveLength(1);
  });

  it("shows stop as pending immediately after the stop button is clicked", async () => {
    const el = document.createElement("talkie-connection-shell") as HTMLElement & {
      relayRunning: boolean;
      stopSupported: boolean;
      updateComplete: Promise<unknown>;
    };
    el.relayRunning = true;
    el.stopSupported = true;
    document.body.appendChild(el);
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[data-action="stop"]')
      ?.click();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain("Relay stopping");

    document.body.removeChild(el);
  });
});
