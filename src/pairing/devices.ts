import { z } from 'zod';
import { STORES, idbDelete, idbGetAll, idbPut } from '@/storage/idb';

export const PairedDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pairedAt: z.string(),
  apiUrl: z.string().optional(),
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
