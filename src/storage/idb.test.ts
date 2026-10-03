import 'fake-indexeddb/auto';
import { forgetPairedDevice, listPairedDevices, savePairedDevice } from '@/pairing/devices';
import { STORES, idbPut } from './idb';

describe('paired devices store', () => {
  it('saves, lists newest first, and forgets', async () => {
    await savePairedDevice({ id: 'a', name: 'Old phone', pairedAt: '2026-01-01T00:00:00.000Z' });
    await savePairedDevice({ id: 'b', name: 'New phone', pairedAt: '2026-02-01T00:00:00.000Z' });
    expect((await listPairedDevices()).map((d) => d.id)).toEqual(['b', 'a']);
    await forgetPairedDevice('b');
    expect((await listPairedDevices()).map((d) => d.id)).toEqual(['a']);
  });

  it('drops malformed rows instead of trusting them', async () => {
    await idbPut(STORES.pairings, { id: 'junk', nope: true } as { id: string });
    const ids = (await listPairedDevices()).map((d) => d.id);
    expect(ids).not.toContain('junk');
  });
});
