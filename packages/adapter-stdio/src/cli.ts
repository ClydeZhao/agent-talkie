import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TalkieSessionClient } from "@agent-talkie/client";
import { safeParseEnvelope, type Envelope } from "@agent-talkie/protocol";
import { ensureRelayRunning } from "@agent-talkie/supervisor";
import { createBoundedQueue } from "./bounded-queue.js";
import { ContentLengthFrameReader } from "./content-length-framing.js";

let droppedCount = 0;

/** Exposed for tests (queue overflow counter). */
export function getStdioAdapterDroppedCount(): number {
  return droppedCount;
}

function parsePositiveIntEnv(raw: string | undefined, defaultVal: number): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultVal;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return defaultVal;
  }
  return n;
}

export async function runStdioAdapter(): Promise<void> {
  const maxQueue = parsePositiveIntEnv(process.env.TALKIE_STDIO_MAX_QUEUE, 100);
  const relay = await ensureRelayRunning({});
  const client = new TalkieSessionClient({
    url: `ws://127.0.0.1:${relay.port}`,
  });
  await client.connect();
  await client.registerSession({
    displayName: process.env.TALKIE_STDIO_DISPLAY_NAME ?? "stdio-adapter",
    runtime: process.env.TALKIE_STDIO_RUNTIME ?? "adapter-stdio",
    workspaceLabel: process.env.TALKIE_STDIO_WORKSPACE_LABEL ?? ".",
  });

  const queue = createBoundedQueue<Envelope>(maxQueue);
  let draining = false;

  const kickDrain = (): void => {
    if (draining) {
      return;
    }
    draining = true;
    setImmediate(() => {
      try {
        while (queue.length > 0) {
          const e = queue.shift();
          if (e) {
            client.sendEnvelope(e);
          }
        }
      } finally {
        draining = false;
        if (queue.length > 0) {
          kickDrain();
        }
      }
    });
  };

  const reader = new ContentLengthFrameReader();
  for await (const obj of reader) {
    const parsed = safeParseEnvelope(obj);
    if (!parsed.success) {
      console.error(
        JSON.stringify({
          level: "warn",
          event: "stdio_adapter_invalid_envelope",
        }),
      );
      continue;
    }
    queue.enqueue(parsed.data, () => {
      droppedCount += 1;
      console.error(
        JSON.stringify({
          level: "warn",
          event: "stdio_adapter_queue_overflow",
          dropped: 1,
        }),
      );
    });
    kickDrain();
  }
}

function isMainModule(): boolean {
  const entry = fileURLToPath(import.meta.url);
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return resolve(argv1) === resolve(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runStdioAdapter().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
