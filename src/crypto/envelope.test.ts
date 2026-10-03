// @vitest-environment node
// tweetnacl rejects jsdom's cross-realm Uint8Array (TextEncoder); real browsers are unaffected.
import nacl from 'tweetnacl';
import { CryptoError, decryptEnvelope, encryptEnvelope, generateKeyPair } from './envelope';
import { fromBase64, toBase64 } from './encoding';

const phone = generateKeyPair();
const daemon = generateKeyPair();

describe('envelope crypto', () => {
  it('round-trips a payload between phone and daemon', () => {
    const env = encryptEnvelope({ method: 'GET', path: '/tasks' }, daemon.publicKey, phone);
    expect(decryptEnvelope(env, phone.publicKey, daemon)).toEqual({
      method: 'GET',
      path: '/tasks',
    });
  });

  it('does not leak the plaintext in the envelope', () => {
    const env = encryptEnvelope({ secret: 'hunter2-hunter2' }, daemon.publicKey, phone);
    expect(JSON.stringify(env)).not.toContain('hunter2');
    expect(env.v).toBe(1);
  });

  it('uses a fresh nonce every time', () => {
    const a = encryptEnvelope({ a: 1 }, daemon.publicKey, phone);
    const b = encryptEnvelope({ a: 1 }, daemon.publicKey, phone);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.box).not.toBe(b.box);
  });

  it('rejects tampered ciphertext', () => {
    const env = encryptEnvelope({ a: 1 }, daemon.publicKey, phone);
    const box = fromBase64(env.box);
    box[0] = (box[0] ?? 0) ^ 1;
    expect(() => decryptEnvelope({ ...env, box: toBase64(box) }, phone.publicKey, daemon)).toThrow(
      CryptoError,
    );
  });

  it('rejects an envelope from a key other than the pinned sender', () => {
    const stranger = generateKeyPair();
    const env = encryptEnvelope({ a: 1 }, daemon.publicKey, stranger);
    expect(() => decryptEnvelope(env, phone.publicKey, daemon)).toThrow('Unexpected sender');
  });

  it('cannot be opened with the wrong secret key', () => {
    const env = encryptEnvelope({ a: 1 }, daemon.publicKey, phone);
    expect(() => decryptEnvelope(env, phone.publicKey, generateKeyPair())).toThrow(CryptoError);
  });

  it('rejects malformed envelopes without throwing anything but CryptoError', () => {
    for (const bad of [null, {}, { v: 2 }, { v: 1, from: '!', nonce: '!', box: '!' }, 'x']) {
      expect(() => decryptEnvelope(bad, phone.publicKey, daemon)).toThrow(CryptoError);
    }
    const env = encryptEnvelope({ a: 1 }, daemon.publicKey, phone);
    const shortNonce = { ...env, nonce: toBase64(nacl.randomBytes(8)) };
    expect(() => decryptEnvelope(shortNonce, phone.publicKey, daemon)).toThrow(CryptoError);
  });
});
