import type { RelayLock } from "./lockfile.js";

function healthUrl(port: number, generation: string): string {
  const q = encodeURIComponent(generation);
  return `http://127.0.0.1:${port}/__agent-talkie/v1/health?generation=${q}`;
}

export async function classifyRelayLock(
  lock: RelayLock,
): Promise<"live" | "stale"> {
  try {
    process.kill(lock.pid, 0);
  } catch {
    return "stale";
  }

  let res: Response;
  try {
    res = await fetch(healthUrl(lock.port, lock.generation), {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return "stale";
  }

  if (res.status !== 200) {
    return "stale";
  }

  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    return "stale";
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as { ok?: unknown }).ok !== true ||
    (body as { generation?: unknown }).generation !== lock.generation
  ) {
    return "stale";
  }

  return "live";
}
