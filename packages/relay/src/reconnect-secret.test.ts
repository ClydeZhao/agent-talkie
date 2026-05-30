import { describe, expect, it } from "vitest";
import { hashReconnectSecret, verifyReconnectSecret } from "./reconnect-secret.js";

describe("reconnect-secret", () => {
  it("verify accepts a matching hash", () => {
    const secret = "test-secret-base64url";
    const pepper = "test-pepper";
    const stored = hashReconnectSecret(secret, pepper);
    expect(verifyReconnectSecret(secret, pepper, stored)).toBe(true);
  });

  it("verify rejects wrong secret", () => {
    const stored = hashReconnectSecret("correct", "pepper");
    expect(verifyReconnectSecret("wrong", "pepper", stored)).toBe(false);
  });

  it("verify rejects length-mismatch hex without throwing", () => {
    expect(verifyReconnectSecret("a", "b", "abc")).toBe(false);
  });
});
