/*
 * The wire contract between the extension and the API (docs/extension.md). The API is implemented
 * by the backend; the dev mock in mock/extension.js follows the same rules.
 */

export const MAX_TABS = 500;
export const MAX_URL = 2048;
export const MAX_TITLE = 1024;

export interface PendingRequest {
  requestId: string;
  configId: string;
  createdAt: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Sync requests this device has not posted a snapshot for yet. Hand-written instead of zod so the
 * service worker stays a few kilobytes. Returns null for anything that is not the expected shape.
 */
export function parsePending(json: unknown): PendingRequest[] | null {
  if (!isObject(json) || !Array.isArray(json.requests)) return null;
  const out: PendingRequest[] = [];
  for (const r of json.requests) {
    if (
      !isObject(r) ||
      !nonEmpty(r.requestId) ||
      !nonEmpty(r.configId) ||
      typeof r.createdAt !== 'string'
    ) {
      return null;
    }
    out.push({ requestId: r.requestId, configId: r.configId, createdAt: r.createdAt });
  }
  return out;
}

export function parseMe(json: unknown): { userId: string } | null {
  return isObject(json) && nonEmpty(json.userId) ? { userId: json.userId } : null;
}

export interface SnapshotTab {
  url: string;
  title: string;
  windowId: number;
  index: number;
  pinned: boolean;
  /** -1 when the tab is not in a group. */
  groupId: number;
}

export interface SnapshotBody {
  requestId: string;
  configId: string;
  deviceId: string;
  deviceName: string;
  capturedAt: string;
  tabs: SnapshotTab[];
}

export type SyncKind = 'ok' | 'error' | 'idle';
export interface SyncStatus {
  kind: SyncKind;
  message: string;
  at: number;
}
