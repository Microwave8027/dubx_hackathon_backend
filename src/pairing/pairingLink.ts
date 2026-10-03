import { z } from 'zod';
import { fromBase64 } from '@/crypto/encoding';

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http and https addresses are allowed');

/** 32-byte NaCl public key, base64. */
const publicKey = z.string().refine((s) => {
  try {
    return fromBase64(s).length === 32;
  } catch {
    return false;
  }
}, 'Not a valid public key');

/*
 * Assumed QR link: {app}/pair?token=<one-time token>&api=<daemon url>
 * and, for relay pairing, also &relay=<relay url>&dpk=<daemon public key, base64>.
 * TODO(backend): confirm parameter names and the token's role once the pairing handshake is final.
 */
export const PairingParamsSchema = z.object({
  token: z.string().min(8).max(256),
  api: httpUrl.optional(),
  relay: httpUrl.optional(),
  dpk: publicKey.optional(),
});
export type PairingParams = z.infer<typeof PairingParamsSchema>;

export function parsePairingParams(search: URLSearchParams): PairingParams | null {
  const raw = Object.fromEntries(
    ['token', 'api', 'relay', 'dpk'].flatMap((k) => {
      const v = search.get(k);
      return v ? [[k, v]] : [];
    }),
  );
  const parsed = PairingParamsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  // A relay link needs the daemon key to authenticate envelopes; a direct link needs the address.
  if (p.relay && !p.dpk) return null;
  if (!p.relay && !p.api) return null;
  return p;
}

export function defaultDeviceName(ua: string = navigator.userAgent): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac browser';
  if (/Windows/.test(ua)) return 'Windows browser';
  return 'This browser';
}
