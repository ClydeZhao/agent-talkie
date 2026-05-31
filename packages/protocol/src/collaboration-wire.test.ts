import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { metadataPatchPayloadSchema } from "./collaboration-wire.js";

describe("collaboration wire schemas", () => {
  it("allows a human metadata status patch to name the target session", () => {
    const parsed = metadataPatchPayloadSchema.safeParse({
      namespace: "status",
      targetSessionId: uuidv7(),
      patch: {
        progress: "blocked",
        blockedReason: "needs approval",
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        namespace: "status",
        targetSessionId: expect.any(String),
      });
    }
  });
});
