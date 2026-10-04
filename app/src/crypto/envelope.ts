import nacl from 'tweetnacl';
import { z } from 'zod';
import { fromBase64, toBase64 } from './encoding';

/*
 * TODO(backend): the envelope format is NOT finalized. This implements the best assumption:
 *
 *   { v: 1, from: base64(sender public key), nonce: base64(24 bytes), box: base64(ciphertext) }
 *
 * where `box` = nacl.box(JSON.stringify(payload), nonce, recipientPublicKey, senderSecretKey).
 * Change the schema and the two functions below once the relay/daemon agree on the real format.
 *
 * Never log keys or decrypted payloads; this module has no logging on purpose.
 */
export const ENVELOPE_VERSION = 1;

export const EnvelopeSchema = z.object({
  v: z.literal(ENVELOPE_VERSION),
  from: z.string(),
  nonce: z.string(),
  box: z.string(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const generateKeyPair = (): KeyPair => nacl.box.keyPair();

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export function encryptEnvelope(
  payload: unknown,
  recipientPublicKey: Uint8Array,
  sender: KeyPair,
): Envelope {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const box = nacl.box(message, nonce, recipientPublicKey, sender.secretKey);
  return {
    v: ENVELOPE_VERSION,
    from: toBase64(sender.publicKey),
    nonce: toBase64(nonce),
    box: toBase64(box),
  };
}

/**
 * Returns the decrypted JSON payload. `expectedSender` pins the daemon's key, so an envelope
 * from anyone else is rejected even if it is a valid box for us.
 */
export function decryptEnvelope(
  raw: unknown,
  expectedSender: Uint8Array,
  recipient: KeyPair,
): unknown {
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success) throw new CryptoError('Malformed envelope');
  let from: Uint8Array;
  let nonce: Uint8Array;
  let box: Uint8Array;
  try {
    from = fromBase64(parsed.data.from);
    nonce = fromBase64(parsed.data.nonce);
    box = fromBase64(parsed.data.box);
  } catch {
    throw new CryptoError('Malformed envelope');
  }
  if (!equalBytes(from, expectedSender)) throw new CryptoError('Unexpected sender');
  if (nonce.length !== nacl.box.nonceLength) throw new CryptoError('Malformed envelope');
  const plain = nacl.box.open(box, nonce, from, recipient.secretKey);
  if (!plain) throw new CryptoError('Could not decrypt envelope');
  try {
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new CryptoError('Malformed payload');
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
