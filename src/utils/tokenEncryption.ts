import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const SALT = process.env.VIBE_TOKEN_SALT ?? "vibe-studio-salt";
const KEY_CACHE = new Map<string, Buffer>();

function getKey(secret?: string): Buffer {
  const raw = secret ?? process.env.VIBE_TOKEN_SECRET;
  if (!raw) {
    throw new Error("VIBE_TOKEN_SECRET is required to encrypt tokens");
  }
  if (KEY_CACHE.has(raw)) {
    return KEY_CACHE.get(raw)!;
  }
  const key = scryptSync(raw, SALT, 32);
  KEY_CACHE.set(raw, key);
  return key;
}

export interface EncryptionPayload {
  iv: string;
  tag: string;
  value: string;
}

export function encryptToken(token: string, secret?: string): EncryptionPayload {
  const key = getKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64"),
  };
}

export function decryptToken(payload: EncryptionPayload, secret?: string): string {
  const key = getKey(secret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

