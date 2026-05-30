import { afterEach, describe, expect, it, vi } from "vitest";
import {
  probeRelayGenerationHealth,
  readBootstrapRelayGeneration,
} from "./relay-generation.js";

describe("relay-generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("probeRelayGenerationHealth returns true on HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as Response),
    );
    const ok = await probeRelayGenerationHealth(
      "http://127.0.0.1:18765",
      "abc",
    );
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:18765/__agent-talkie/v1/health?generation=abc",
    );
  });

  it("probeRelayGenerationHealth returns false on HTTP 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      } as Response),
    );
    const ok = await probeRelayGenerationHealth(
      "http://127.0.0.1:18765",
      "abc",
    );
    expect(ok).toBe(false);
  });

  it("readBootstrapRelayGeneration reads ?generation= from window", () => {
    vi.stubGlobal("window", {
      location: { search: "?generation=xyz" },
    });
    expect(readBootstrapRelayGeneration()).toBe("xyz");
  });
});
