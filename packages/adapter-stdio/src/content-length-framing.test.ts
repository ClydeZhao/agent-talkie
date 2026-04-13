import { Readable } from "node:stream";
import { describe, it, expect } from "vitest";
import { ContentLengthFrameReader } from "./content-length-framing.js";

describe("ContentLengthFrameReader", () => {
  it("yields one object from Content-Length: 11 and JSON body", async () => {
    const body = '{"abcde":1}';
    expect(Buffer.byteLength(body, "utf8")).toBe(11);
    const buf = Buffer.from(`Content-Length: 11\r\n\r\n${body}`);
    const input = Readable.from([buf]);
    const reader = new ContentLengthFrameReader(input);
    const out: unknown[] = [];
    for await (const o of reader) {
      out.push(o);
    }
    expect(out).toEqual([{ abcde: 1 }]);
  });
});
