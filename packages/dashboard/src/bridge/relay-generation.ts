import { RELAY_GENERATION_KEY } from "./session-storage-keys.js";

/**
 * Bootstrap relay generation from `?generation=` (browser) or
 * `VITE_RELAY_GENERATION` (Vite env). Empty strings are treated as absent.
 */
export function readBootstrapRelayGeneration(): string | null {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("generation");
    if (q !== null && q.length > 0) {
      return q;
    }
  }
  const env = import.meta.env.VITE_RELAY_GENERATION;
  if (typeof env === "string" && env.length > 0) {
    return env;
  }
  return null;
}

export async function probeRelayGenerationHealth(
  httpOrigin: string,
  generation: string,
): Promise<boolean> {
  const response = await fetch(
    `${httpOrigin}/__agent-talkie/v1/health?generation=${encodeURIComponent(generation)}`,
  );
  return response.ok === true;
}

export function persistRelayGenerationIfMissing(gen: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  if (gen.length === 0) {
    return;
  }
  const existing = sessionStorage.getItem(RELAY_GENERATION_KEY);
  if (existing !== null && existing !== "") {
    return;
  }
  sessionStorage.setItem(RELAY_GENERATION_KEY, gen);
}
