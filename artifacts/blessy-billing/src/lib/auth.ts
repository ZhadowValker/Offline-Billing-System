/**
 * Simple session-based auth.
 * Password is stored as a SHA-256 hash in IndexedDB (Settings).
 * Session is kept in sessionStorage so it clears on browser close.
 */

const SESSION_KEY = "blessy_auth";
const DEFAULT_PASSWORD = "blessy123";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  return sha256(password);
}

export async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  const inputHash = await sha256(input);
  return inputHash === storedHash;
}

export async function getDefaultHash(): Promise<string> {
  return sha256(DEFAULT_PASSWORD);
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function login(): void {
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export { DEFAULT_PASSWORD };
