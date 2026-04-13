# Adapter ingress

## Adapter ingress pattern

Adapters sit at the **edge** between a native runtime (stdio, IDE plugin, etc.) and the relay. They translate native I/O into the same **envelope** model and **WebSocket session** flow as first-class clients. The relay stays the single canonical core transport; adapters do not introduce alternate routing or protocol stacks.

- Adapters must NOT become a second transport architecture.

## Same client and transport as consumers

**ADAPT-03:** Use the same session client and WebSocket path as any other consumer: handshake, `session.register`, then validated envelopes on the open socket. Do not fork or bypass relay wire semantics at the adapter layer.

Example:

```typescript
import { TalkieSessionClient } from "@agent-talkie/client";

const client = new TalkieSessionClient({
  url: "ws://127.0.0.1:18765",
});
await client.connect();
await client.registerSession({
  displayName: "my-session",
  runtime: "my-runtime",
  workspaceLabel: ".",
});
```

## Stdio reference adapter

Package `@agent-talkie/adapter-stdio` implements **D-10** framing: an HTTP-style header block ending with `\r\n\r\n`, with a required line `Content-Length: N` where `N` is the decimal length in bytes of the UTF-8 JSON body. Example prefix:

```http
Content-Length: 42

```

Each frame body must be a JSON value that passes `safeParseEnvelope()` before it is forwarded with `sendEnvelope()`.

- **Binary:** `talkie-stdio-adapter` (see package `bin`).
- **Queue:** Environment variable `TALKIE_STDIO_MAX_QUEUE` sets the bounded outbound queue length; it must be a positive integer. If unset or invalid, the default is **100**. When the queue is full, the adapter drops the **oldest** pending envelope, writes a structured warning line to **stderr**, and increments an internal counter — **no relay protocol error** (**D-12**).
- **Local relay:** Call `ensureRelayRunning()` from `@agent-talkie/supervisor` before `connect()` so a localhost daemon is available (same pattern as the CLI).

Optional session identity overrides: `TALKIE_STDIO_DISPLAY_NAME`, `TALKIE_STDIO_RUNTIME`, `TALKIE_STDIO_WORKSPACE` (see adapter source defaults).

## Security notes

- Treat stdin as **untrusted**: frames are size-capped (262144 bytes, aligned with relay inbound limits) and envelopes are validated with `safeParseEnvelope` before send.
- Overload (queue overflow) is reported **stderr-only** per **D-12**; it does not surface as an error on the relay protocol stream.
