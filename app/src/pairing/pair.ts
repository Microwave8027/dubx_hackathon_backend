import { setApiUrlOverride } from '@/api/config';
import { fromBase64, toBase64 } from '@/crypto/encoding';
import { generateKeyPair } from '@/crypto/envelope';
import { createDirectTransport } from '@/transport/direct';
import { createRelayTransport } from '@/transport/relay';
import { setTransport } from '@/transport';
import {
  forgetPairedDevice,
  listPairedDevices,
  savePairedDevice,
  type PairedDevice,
} from './devices';
import type { PairingParams } from './pairingLink';

const ACTIVE_KEY = 'cc.activePairing';

const getActive = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const setActive = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable: the pairing still works for this session */
  }
};

/**
 * Stores the pairing and makes it the active connection. The token is not sent anywhere in
 * direct mode (the default contract has no auth); it is only kept as proof of the pairing.
 */
export async function completePairing(params: PairingParams, name: string): Promise<PairedDevice> {
  const device: PairedDevice = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Phone',
    pairedAt: new Date().toISOString(),
    apiUrl: params.api,
  };
  if (params.relay && params.dpk) {
    const keys = generateKeyPair();
    device.relay = {
      url: params.relay,
      publicKey: toBase64(keys.publicKey),
      secretKey: toBase64(keys.secretKey),
      daemonPublicKey: params.dpk,
    };
    // TODO(backend): the phone's public key must reach the daemon to finish the handshake
    // (a "complete pairing" call through the relay). Not part of the current contract.
  }
  await savePairedDevice(device);
  setActive(device.id);
  if (!device.relay && params.api) setApiUrlOverride(params.api);
  applyDevice(device);
  return device;
}

export function applyDevice(device: PairedDevice | undefined): void {
  if (device?.relay) {
    setTransport(
      createRelayTransport({
        relayUrl: device.relay.url,
        deviceId: device.id,
        keys: {
          publicKey: fromBase64(device.relay.publicKey),
          secretKey: fromBase64(device.relay.secretKey),
        },
        daemonPublicKey: fromBase64(device.relay.daemonPublicKey),
      }),
    );
  } else {
    setTransport(createDirectTransport());
  }
}

/** Run once at startup so a relay pairing is in place before the first request. */
export async function initTransport(): Promise<void> {
  const id = getActive();
  if (!id) return;
  try {
    applyDevice((await listPairedDevices()).find((d) => d.id === id));
  } catch {
    /* IndexedDB unavailable: fall back to the direct transport */
  }
}

export async function forgetPairing(id: string): Promise<void> {
  await forgetPairedDevice(id);
  if (getActive() === id) {
    setActive(null);
    setApiUrlOverride(null);
    setTransport(createDirectTransport());
  }
}
