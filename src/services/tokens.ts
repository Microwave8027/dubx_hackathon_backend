import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiToken, DesktopLoginCode } from "../models/ApiToken.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 90 * DAY_MS; // sliding: extended whenever the token is used
const CODE_TTL_MS = 2 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const base64url = (b: Buffer) => b.toString("base64url");

/** Creates a bearer token for `userId`. The plaintext is returned once and never stored. */
export async function issueApiToken(userId: string, name: string): Promise<string> {
  const token = base64url(randomBytes(32));
  await ApiToken.create({
    userId,
    name,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return token;
}

/** Resolves a bearer token to its user id, or null if unknown/expired. */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!token) return null;
  const doc = await ApiToken.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!doc) return null;
  // Slide the expiry at most once a day to avoid a write per request.
  if (Date.now() - doc.lastUsedAt.getTime() > DAY_MS) {
    await ApiToken.updateOne(
      { _id: doc._id },
      { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    );
  }
  return String(doc.userId);
}

export async function revokeApiToken(token: string): Promise<void> {
  await ApiToken.deleteOne({ tokenHash: sha256(token) });
}

/** One-time code for the desktop loopback redirect, bound to the app's PKCE challenge. */
export async function createDesktopCode(userId: string, challenge: string): Promise<string> {
  const code = base64url(randomBytes(32));
  await DesktopLoginCode.create({
    codeHash: sha256(code),
    userId,
    challenge,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/** Consumes a desktop code; returns the user id if the code is valid and the verifier matches. */
export async function redeemDesktopCode(code: string, verifier: string): Promise<string | null> {
  const doc = await DesktopLoginCode.findOneAndDelete({ codeHash: sha256(code) });
  if (!doc || doc.expiresAt.getTime() < Date.now()) return null;
  const expected = Buffer.from(doc.challenge);
  const actual = Buffer.from(base64url(createHash("sha256").update(verifier).digest()));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return String(doc.userId);
}

/** The bearer token from an `Authorization: Bearer ...` header, if any. */
export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1]! : null;
}
