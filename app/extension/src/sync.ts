import { ApiError, type Api } from './api';
import type { PendingRequest, SnapshotBody, SyncStatus } from './contract';
import { dueItems, enqueue, markFailed, remove } from './queue';
import { rememberHandled, type StoredState } from './storage';
import type { CaptureResult } from './tabs';

export interface SyncDeps {
  load(): Promise<StoredState>;
  save(patch: Partial<StoredState>): Promise<void>;
  createApi(apiBase: string, token: string): Api;
  capture(): Promise<CaptureResult>;
  now(): number;
}

export type SyncSkip = 'no-consent' | 'not-configured';
export interface SyncResult {
  skipped?: SyncSkip;
  posted: number;
  queued: number;
  failed?: string;
}

const status = (kind: SyncStatus['kind'], message: string, now: number): SyncStatus => ({
  kind,
  message,
  at: now,
});

/**
 * One pass: retry queued snapshots that are due, ask the server which sync requests this device
 * has not answered, capture the tabs once, and post a snapshot for each (oldest first). State is
 * saved after every step because the worker can be killed at any time.
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  let state = await deps.load();
  if (!state.consented) {
    await deps.save({
      status: status('idle', 'Waiting for you to accept the consent note.', deps.now()),
    });
    return { skipped: 'no-consent', posted: 0, queued: 0 };
  }
  const { apiBase, token } = state.settings;
  if (!apiBase || !token) {
    await deps.save({
      status: status('idle', 'Not connected: add the API URL and token.', deps.now()),
    });
    return { skipped: 'not-configured', posted: 0, queued: 0 };
  }

  const api = deps.createApi(apiBase, token);
  const result: SyncResult = { posted: 0, queued: 0 };
  const fail = async (e: unknown): Promise<SyncResult> => {
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    await deps.save({ status: status('error', message, deps.now()) });
    return { ...result, failed: message };
  };

  // 1. Retry anything that failed before and is due.
  for (const item of dueItems(state.queue, deps.now())) {
    try {
      await api.postSnapshot(item.body);
      state = { ...state, queue: remove(state.queue, item.body.requestId) };
      await deps.save({ queue: state.queue, lastSnapshotAt: deps.now() });
      result.posted += 1;
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'auth') return fail(e);
      const dropped = e instanceof ApiError && !e.retryable;
      state = {
        ...state,
        queue: dropped
          ? remove(state.queue, item.body.requestId)
          : markFailed(state.queue, item.body.requestId, deps.now()),
      };
      await deps.save({ queue: state.queue });
    }
  }

  // 2. Which requests are new for this device?
  let pending: PendingRequest[];
  try {
    pending = await api.pending(state.deviceId);
  } catch (e) {
    return fail(e);
  }
  const fresh = pending
    .filter((r) => !state.handledIds.includes(r.requestId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (fresh.length === 0) {
    if (state.queue.length === 0) {
      await deps.save({
        status: status(
          'ok',
          state.lastSnapshotAt ? 'Up to date.' : 'Connected. Waiting for a config save.',
          deps.now(),
        ),
      });
    } else {
      await deps.save({
        status: status('error', `${state.queue.length} snapshot(s) waiting to retry.`, deps.now()),
      });
    }
    return result;
  }

  // 3. Capture once, answer every new request with it.
  const { tabs, truncated } = await deps.capture();
  const capturedAt = new Date(deps.now()).toISOString();
  for (const req of fresh) {
    const body: SnapshotBody = {
      requestId: req.requestId,
      configId: req.configId,
      deviceId: state.deviceId,
      deviceName: state.settings.deviceName || 'Chrome',
      capturedAt,
      tabs,
    };
    const handledIds = rememberHandled(state.handledIds, req.requestId);
    try {
      await api.postSnapshot(body);
      state = { ...state, handledIds };
      result.posted += 1;
      await deps.save({
        handledIds,
        lastHandledRequestId: req.requestId,
        lastSnapshotAt: deps.now(),
        status: status(
          'ok',
          `Sent ${tabs.length} tab${tabs.length === 1 ? '' : 's'}${truncated ? ` (${truncated} over the limit left out)` : ''}.`,
          deps.now(),
        ),
      });
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'auth') return fail(e);
      if (e instanceof ApiError && !e.retryable) {
        // The server will never accept this one (for example too large): do not retry it.
        state = { ...state, handledIds };
        await deps.save({ handledIds, lastHandledRequestId: req.requestId });
        return fail(e);
      }
      // Network or server trouble: keep the snapshot and retry with backoff.
      state = { ...state, handledIds, queue: enqueue(state.queue, body, deps.now()) };
      result.queued += 1;
      await deps.save({
        handledIds,
        lastHandledRequestId: req.requestId,
        queue: state.queue,
        status: status('error', 'Could not send. It will retry automatically.', deps.now()),
      });
    }
  }
  return result;
}

/** Runs share one in-flight pass, so an alarm and a message at the same moment do not double-post. */
export function createSyncRunner(deps: SyncDeps): () => Promise<SyncResult> {
  let inFlight: Promise<SyncResult> | null = null;
  return () => {
    inFlight ??= runSync(deps).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
