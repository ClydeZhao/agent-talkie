/** Same cap as relay `MAX_INBOUND_WS_BYTES`. */
export const MAX_FRAME_BODY_BYTES = 262144;

function parseContentLength(headersText: string): number | undefined {
  for (const line of headersText.split(/\r\n/)) {
    const m = /^Content-Length:\s*(\d+)\s*$/i.exec(line.trim());
    if (m) {
      return Number.parseInt(m[1], 10);
    }
  }
  return undefined;
}

/**
 * Reads Content-Length-framed JSON bodies from a byte stream.
 * Headers end with `\r\n\r\n`; required line `Content-Length: <n>` (decimal UTF-8 bytes).
 */
export class ContentLengthFrameReader {
  constructor(
    private readonly input: NodeJS.ReadableStream = process.stdin,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    let buf = Buffer.alloc(0);

    for await (const chunk of this.input) {
      const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buf = Buffer.concat([buf, c]);

      while (true) {
        const sep = buf.indexOf("\r\n\r\n");
        if (sep === -1) {
          break;
        }

        const headerText = buf.subarray(0, sep).toString("utf8");
        const bodyStart = sep + 4;
        const len = parseContentLength(headerText);
        if (len === undefined || !Number.isFinite(len) || len < 0) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "stdio_adapter_invalid_frame_headers",
            }),
          );
          process.exit(1);
        }
        if (len > MAX_FRAME_BODY_BYTES) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "stdio_adapter_frame_too_large",
              maxBytes: MAX_FRAME_BODY_BYTES,
            }),
          );
          process.exit(1);
        }

        if (buf.length < bodyStart + len) {
          break;
        }

        const bodyBuf = buf.subarray(bodyStart, bodyStart + len);
        buf = buf.subarray(bodyStart + len);

        const text = bodyBuf.toString("utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          continue;
        }
        yield parsed;
      }
    }
  }
}
