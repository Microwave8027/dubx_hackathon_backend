import type { SnapshotBody } from './contract';

/** Snapshots that failed to post and will be retried with backoff. */
export interface QueueItem {
  body: SnapshotBody;
  attempts: number;
  nextAttemptAt: number;
  enqueuedAt: number;
}

export const MAX_QUEUE = 20;
const BASE_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

/** 30s, 1m, 2m, 4m ... capped at 30 minutes. */
export const backoffMs = (attempts: number): number =>
  Math.min(BASE_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);

/** Adds an item (or replaces one with the same requestId). Beyond the cap the oldest are dropped. */
export function enqueue(queue: QueueItem[], body: SnapshotBody, now: number): QueueItem[] {
  const without = queue.filter((q) => q.body.requestId !== body.requestId);
  const next = [
    ...without,
    { body, attempts: 1, nextAttemptAt: now + backoffMs(1), enqueuedAt: now },
  ];
  return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
}

export const dueItems = (queue: QueueItem[], now: number): QueueItem[] =>
  queue.filter((q) => q.nextAttemptAt <= now);

export function markFailed(queue: QueueItem[], requestId: string, now: number): QueueItem[] {
  return queue.map((q) =>
    q.body.requestId === requestId
      ? { ...q, attempts: q.attempts + 1, nextAttemptAt: now + backoffMs(q.attempts + 1) }
      : q,
  );
}

export const remove = (queue: QueueItem[], requestId: string): QueueItem[] =>
  queue.filter((q) => q.body.requestId !== requestId);
