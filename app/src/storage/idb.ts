// Tiny promise wrapper over IndexedDB (no dependency). One database, one object store per kind.
const DB_NAME = 'command-center';
const DB_VERSION = 1;
export const STORES = { pairings: 'pairings' } as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

/** Values are untrusted on read; callers must validate (Zod) before use. */
export const idbGetAll = (store: StoreName): Promise<unknown[]> =>
  run(store, 'readonly', (s) => s.getAll());
export const idbPut = (store: StoreName, value: { id: string }): Promise<IDBValidKey> =>
  run(store, 'readwrite', (s) => s.put(value));
export const idbDelete = (store: StoreName, id: string): Promise<undefined> =>
  run(store, 'readwrite', (s) => s.delete(id));
