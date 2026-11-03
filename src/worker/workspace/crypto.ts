import { CommandError } from "./context";
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function key(secret?: string) {
  if (!secret) throw new CommandError("invalid", "GitHub token encryption is not configured");
  try {
    const bytes = decode(secret);
    if (bytes.length !== 32) throw new Error("length");
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { throw new CommandError("invalid", "GitHub token encryption is not configured correctly"); }
}
export async function encryptToken(token: string, secret?: string): Promise<string> {
  const k = await key(secret), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(token));
  return "v1." + encode(iv) + "." + encode(new Uint8Array(ciphertext));
}
export async function decryptToken(encrypted: string, secret?: string): Promise<string> {
  const [version, iv, body] = encrypted.split(".");
  if (version !== "v1" || !iv || !body) throw new Error("Invalid encrypted token");
  const value = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await key(secret), decode(body));
  return new TextDecoder().decode(value);
}
