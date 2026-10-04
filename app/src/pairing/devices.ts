import { z } from 'zod';
import { STORES, idbDelete, idbGetAll, idbPut } from '@/storage/idb';

// Relay pairing material, base64. The secret key never leaves this device's IndexedDB.
const RelayPairingSchema = z.object({
  url: z.string(),
  publicKey: z.string(),
  secretKey: z.string(),
  daemonPublicKey: z.string(),
});

export const PairedDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pairedAt: z.string(),
  apiUrl: z.string().optional(),
  relay: RelayPairingSchema.optional(),
});
export type PairedDevice = z.infer<typeof PairedDeviceSchema>;

/** Stored records are validated on the way out; anything malformed is dropped. */
export async function listPairedDevices(): Promise<PairedDevice[]> {
  const rows = await idbGetAll(STORES.pairings);
  return rows
    .map((r) => PairedDeviceSchema.safeParse(r))
    .flatMap((r) => (r.success ? [r.data] : []))
    .sort((a, b) => b.pairedAt.localeCompare(a.pairedAt));
}

export const savePairedDevice = (device: PairedDevice) => idbPut(STORES.pairings, device);
export const forgetPairedDevice = (id: string) => idbDelete(STORES.pairings, id);
