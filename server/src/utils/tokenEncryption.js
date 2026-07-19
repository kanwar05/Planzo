import crypto from "node:crypto";

const keyFrom = (secret) =>
  crypto.createHash("sha256").update(String(secret)).digest();

export function encryptSecret(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value, secret) {
  const [iv, tag, ciphertext] = String(value).split(".").map((part) =>
    Buffer.from(part, "base64url"),
  );
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted token.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
