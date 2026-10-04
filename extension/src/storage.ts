import type { QueueItem } from './queue';
import type { SyncStatus } from './contract';

export interface Settings {
  /** Base URL of the API, e.g. https://app.example.com, without a trailing slash. */
  apiBase: string;
  token: string;
  deviceName: string;
}

export interface StoredState {
  settings: Settings;
  /** The user has read the note that tab URLs and titles are sent to their account. */
  consented: boolean;
  deviceId: string;
  lastHandledRequestId: string | null;
  handledIds: string[];
  status: SyncStatus | null;
  lastSnapshotAt: number | null;
  queue: QueueItem[];
}

const MAX_HANDLED = 100;

export const defaults: StoredState = {
  settings: { apiBase: '', token: '', deviceName: '' },
  consented: false,
  deviceId: '',
  lastHandledRequestId: null,
  handledIds: [],
  status: null,
  lastSnapshotAt: null,
  queue: [],
};

export async function load(): Promise<StoredState> {
  const stored = (await chrome.storage.local.get(null)) as Partial<StoredState>;
  return {
    ...defaults,
    ...stored,
    settings: { ...defaults.settings, ...stored.settings },
  };
}

export async function save(patch: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** Generated once at install and kept for the life of the installation. */
export async function ensureDeviceId(): Promise<string> {
  const { deviceId } = await load();
  if (deviceId) return deviceId;
  const fresh = crypto.randomUUID();
  await save({ deviceId: fresh });
  return fresh;
}

export const rememberHandled = (ids: string[], requestId: string): string[] =>
  [...ids.filter((i) => i !== requestId), requestId].slice(-MAX_HANDLED);
