import { createHash, timingSafeEqual } from "node:crypto";

export function hashReconnectSecret(secret: string, pepper: string): string {
  return createHash("sha256")
    .update(pepper, "utf8")
    .update(secret, "utf8")
    .digest("hex");
}

export function verifyReconnectSecret(
  secret: string,
  pepper: string,
  storedHashHex: string,
): boolean {
  const hash = hashReconnectSecret(secret, pepper);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(hash, "hex");
    b = Buffer.from(storedHashHex, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
