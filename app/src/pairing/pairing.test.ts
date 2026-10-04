import 'fake-indexeddb/auto';
import { toBase64 } from '@/crypto/encoding';
import { generateKeyPair } from '@/crypto/envelope';
import { getTransport, setTransport } from '@/transport';
import { createDirectTransport } from '@/transport/direct';
import { getApiUrl } from '@/api/config';
import { listPairedDevices } from './devices';
import { completePairing, forgetPairing, initTransport } from './pair';
import { defaultDeviceName, parsePairingParams } from './pairingLink';

const dpk = toBase64(generateKeyPair().publicKey);
const q = (o: Record<string, string>) => new URLSearchParams(o);

beforeEach(async () => {
  localStorage.clear();
  setTransport(createDirectTransport());
  for (const d of await listPairedDevices()) await forgetPairing(d.id);
});

describe('parsePairingParams', () => {
  it('accepts a direct link', () => {
    expect(parsePairingParams(q({ token: 'pair_12345678', api: 'http://10.0.0.5:8787' }))).toEqual({
      token: 'pair_12345678',
      api: 'http://10.0.0.5:8787',
    });
  });

  it('accepts a relay link only with the daemon public key', () => {
    expect(
      parsePairingParams(q({ token: 'pair_12345678', relay: 'https://relay.test', dpk })),
    ).toMatchObject({
      relay: 'https://relay.test',
    });
    expect(
      parsePairingParams(q({ token: 'pair_12345678', relay: 'https://relay.test' })),
    ).toBeNull();
  });

  it('rejects missing, short or hostile values', () => {
    expect(parsePairingParams(q({}))).toBeNull();
    expect(parsePairingParams(q({ token: 'short', api: 'http://x.test' }))).toBeNull();
    expect(parsePairingParams(q({ token: 'pair_12345678' }))).toBeNull();
    expect(
      parsePairingParams(q({ token: 'pair_12345678', api: 'javascript:alert(1)' })),
    ).toBeNull();
    expect(
      parsePairingParams(q({ token: 'pair_12345678', relay: 'https://r.test', dpk: 'AAAA' })),
    ).toBeNull();
  });
});

describe('completePairing', () => {
  it('stores a direct pairing, applies the API address and survives a restart', async () => {
    const device = await completePairing(
      { token: 'pair_12345678', api: 'http://10.0.0.5:8787' },
      '  My phone ',
    );
    expect(device.name).toBe('My phone');
    expect((await listPairedDevices()).map((d) => d.id)).toEqual([device.id]);
    expect(getApiUrl()).toBe('http://10.0.0.5:8787');
    expect(getTransport().kind).toBe('direct');
  });

  it('stores a relay pairing with fresh keys and restores the relay transport on startup', async () => {
    const device = await completePairing(
      { token: 'pair_12345678', relay: 'https://relay.test', dpk },
      'Pixel',
    );
    expect(getTransport().kind).toBe('relay');
    expect(device.relay?.daemonPublicKey).toBe(dpk);
    expect(device.relay?.secretKey).toBeTruthy();

    setTransport(createDirectTransport()); // simulate a fresh page load
    await initTransport();
    expect(getTransport().kind).toBe('relay');
  });

  it('forgetting the active pairing returns to the direct transport and clears the override', async () => {
    const device = await completePairing(
      { token: 'pair_12345678', api: 'http://10.0.0.5:8787' },
      'x',
    );
    await forgetPairing(device.id);
    expect(await listPairedDevices()).toHaveLength(0);
    expect(getApiUrl()).not.toBe('http://10.0.0.5:8787');
    expect(getTransport().kind).toBe('direct');
  });
});

describe('defaultDeviceName', () => {
  it('names common devices', () => {
    expect(defaultDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
    expect(defaultDeviceName('Mozilla/5.0 (Linux; Android 14)')).toBe('Android phone');
    expect(defaultDeviceName('curl/8')).toBe('This browser');
  });
});
