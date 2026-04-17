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
});
