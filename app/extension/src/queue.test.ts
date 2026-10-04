import type { SnapshotBody } from './contract';
import { MAX_QUEUE, backoffMs, dueItems, enqueue, markFailed, remove } from './queue';

const body = (id: string): SnapshotBody => ({
  requestId: id,
  configId: 'c',
  deviceId: 'd',
  deviceName: 'Chrome',
  capturedAt: '2026-01-01T00:00:00Z',
  tabs: [],
});

describe('backoff', () => {
  it('doubles from 30s and caps at 30 minutes', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});

describe('queue', () => {
  it('schedules the first retry after the backoff', () => {
    const q = enqueue([], body('a'), 1000);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ attempts: 1, nextAttemptAt: 31_000 });
    expect(dueItems(q, 30_999)).toHaveLength(0);
    expect(dueItems(q, 31_000)).toHaveLength(1);
  });

  it('does not queue the same request twice', () => {
    let q = enqueue([], body('a'), 0);
    q = enqueue(q, body('a'), 5000);
    expect(q).toHaveLength(1);
    expect(q[0]?.enqueuedAt).toBe(5000);
  });

  it('is capped, dropping the oldest first', () => {
    let q = enqueue([], body('first'), 0);
    for (let i = 0; i < MAX_QUEUE + 5; i++) q = enqueue(q, body(`r${i}`), i + 1);
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q.some((x) => x.body.requestId === 'first')).toBe(false);
    expect(q.at(-1)?.body.requestId).toBe(`r${MAX_QUEUE + 4}`);
  });

  it('backs off further after each failure and removes on success', () => {
    let q = enqueue([], body('a'), 0);
    q = markFailed(q, 'a', 100_000);
    expect(q[0]).toMatchObject({ attempts: 2, nextAttemptAt: 160_000 });
    q = markFailed(q, 'a', 200_000);
    expect(q[0]).toMatchObject({ attempts: 3, nextAttemptAt: 320_000 });
    expect(remove(q, 'a')).toEqual([]);
  });
});
