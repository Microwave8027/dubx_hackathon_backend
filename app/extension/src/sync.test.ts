import { vi } from 'vitest';
import { ApiError, type Api } from './api';
import type { PendingRequest, SnapshotBody } from './contract';
import { MAX_QUEUE } from './queue';
import { defaults, type StoredState } from './storage';
import { createSyncRunner, runSync, type SyncDeps } from './sync';

const req = (id: string, createdAt = '2026-01-01T00:00:00Z'): PendingRequest => ({
  requestId: id,
  configId: 'config-1',
  createdAt,
});

function setup(initial: Partial<StoredState> = {}, api: Partial<Api> = {}) {
  let state: StoredState = {
    ...defaults,
    consented: true,
    deviceId: 'device-1',
    settings: { apiBase: 'https://x.example', token: 'tok', deviceName: 'Chrome on mac' },
    ...initial,
  };
  let clock = 1_000_000;
  const posted: SnapshotBody[] = [];
  const fullApi: Api = {
    me: vi.fn().mockResolvedValue({ userId: 'u1' }),
    pending: vi.fn().mockResolvedValue([]),
    postSnapshot: vi.fn().mockImplementation(async (b: SnapshotBody) => {
      posted.push(b);
      return { duplicate: false };
    }),
    ...api,
  };
  const capture = vi.fn().mockResolvedValue({
    tabs: [
      { url: 'https://a.example', title: 'A', windowId: 1, index: 0, pinned: false, groupId: -1 },
    ],
    truncated: 0,
  });
  const deps: SyncDeps = {
    load: async () => state,
    save: async (patch) => {
      state = { ...state, ...patch };
    },
    createApi: () => fullApi,
    capture,
    now: () => clock,
  };
  return {
    deps,
    api: fullApi,
    capture,
    posted,
    get state() {
      return state;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('runSync: preconditions', () => {
  it('does nothing, and reads no tabs, until the user has consented', async () => {
    const t = setup({ consented: false });
    const r = await runSync(t.deps);
    expect(r.skipped).toBe('no-consent');
    expect(t.capture).not.toHaveBeenCalled();
    expect(t.api.pending).not.toHaveBeenCalled();
  });

  it('does nothing without a token or API URL', async () => {
    const t = setup({ settings: { apiBase: 'https://x.example', token: '', deviceName: 'c' } });
    expect((await runSync(t.deps)).skipped).toBe('not-configured');
    expect(t.capture).not.toHaveBeenCalled();
  });
});

describe('runSync: a new request', () => {
  it('captures the tabs and posts the documented body', async () => {
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]) });
    const r = await runSync(t.deps);
    expect(r).toMatchObject({ posted: 1, queued: 0 });
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]).toEqual({
      requestId: 'r1',
      configId: 'config-1',
      deviceId: 'device-1',
      deviceName: 'Chrome on mac',
      capturedAt: new Date(1_000_000).toISOString(),
      tabs: [
        { url: 'https://a.example', title: 'A', windowId: 1, index: 0, pinned: false, groupId: -1 },
      ],
    });
    expect(t.state.lastHandledRequestId).toBe('r1');
    expect(t.state.status).toMatchObject({ kind: 'ok', message: 'Sent 1 tab.' });
    expect(t.state.lastSnapshotAt).toBe(1_000_000);
  });

  it('does not answer the same request twice', async () => {
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]) });
    await runSync(t.deps);
    await runSync(t.deps);
    expect(t.posted).toHaveLength(1);
    expect(t.capture).toHaveBeenCalledTimes(1);
  });

  it('captures once for several requests and answers oldest first', async () => {
    const t = setup(
      {},
      {
        pending: vi
          .fn()
          .mockResolvedValue([
            req('new', '2026-01-03T00:00:00Z'),
            req('old', '2026-01-01T00:00:00Z'),
          ]),
      },
    );
    await runSync(t.deps);
    expect(t.capture).toHaveBeenCalledTimes(1);
    expect(t.posted.map((p) => p.requestId)).toEqual(['old', 'new']);
    expect(t.state.lastHandledRequestId).toBe('new');
  });

  it('says when tabs over the limit were left out', async () => {
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]) });
    t.capture.mockResolvedValue({ tabs: [], truncated: 12 });
    await runSync(t.deps);
    expect(t.state.status?.message).toContain('12 over the limit');
  });

  it('reports up to date when nothing is pending', async () => {
    const t = setup({ lastSnapshotAt: 5 });
    await runSync(t.deps);
    expect(t.state.status).toMatchObject({ kind: 'ok', message: 'Up to date.' });
    expect(t.capture).not.toHaveBeenCalled();
  });
});

describe('runSync: failures', () => {
  it('queues a snapshot when the network fails, then retries it once it is due', async () => {
    const postSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('down', 'network'))
      .mockResolvedValue({ duplicate: false });
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]), postSnapshot });
    const first = await runSync(t.deps);
    expect(first).toMatchObject({ posted: 0, queued: 1 });
    expect(t.state.queue).toHaveLength(1);
    expect(t.state.status?.kind).toBe('error');

    // Not due yet: nothing is sent and the tabs are not captured again.
    await runSync(t.deps);
    expect(postSnapshot).toHaveBeenCalledTimes(1);
    expect(t.capture).toHaveBeenCalledTimes(1);

    t.advance(31_000);
    const retry = await runSync(t.deps);
    expect(retry.posted).toBe(1);
    expect(t.state.queue).toEqual([]);
    expect(postSnapshot).toHaveBeenCalledTimes(2);
  });

  it('backs off further when a retry fails again', async () => {
    const postSnapshot = vi.fn().mockRejectedValue(new ApiError('down', 'server', 503));
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]), postSnapshot });
    await runSync(t.deps);
    t.advance(31_000);
    await runSync(t.deps);
    expect(t.state.queue[0]).toMatchObject({ attempts: 2 });
    expect(t.state.queue[0]!.nextAttemptAt).toBe(1_000_000 + 31_000 + 60_000);
  });

  it('caps the queue', async () => {
    const postSnapshot = vi.fn().mockRejectedValue(new ApiError('down', 'network'));
    const many = Array.from({ length: MAX_QUEUE + 5 }, (_, i) =>
      req(`r${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`),
    );
    const t = setup({}, { pending: vi.fn().mockResolvedValue(many), postSnapshot });
    await runSync(t.deps);
    expect(t.state.queue).toHaveLength(MAX_QUEUE);
  });

  it('stops on a rejected token and does not queue', async () => {
    const t = setup(
      {},
      {
        pending: vi.fn().mockResolvedValue([req('r1')]),
        postSnapshot: vi.fn().mockRejectedValue(new ApiError('bad token', 'auth', 401)),
      },
    );
    const r = await runSync(t.deps);
    expect(r.failed).toBe('bad token');
    expect(t.state.queue).toEqual([]);
    expect(t.state.status).toMatchObject({ kind: 'error', message: 'bad token' });
  });

  it('gives up on a snapshot the server will never accept', async () => {
    const t = setup(
      {},
      {
        pending: vi.fn().mockResolvedValue([req('r1')]),
        postSnapshot: vi.fn().mockRejectedValue(new ApiError('too big', 'rejected', 413)),
      },
    );
    await runSync(t.deps);
    expect(t.state.queue).toEqual([]);
    expect(t.state.handledIds).toContain('r1');
    expect(t.state.status?.kind).toBe('error');
  });

  it('reports an unreachable server when asking for pending requests', async () => {
    const t = setup(
      {},
      {
        pending: vi.fn().mockRejectedValue(new ApiError('Could not reach the server.', 'network')),
      },
    );
    const r = await runSync(t.deps);
    expect(r.failed).toMatch(/could not reach/i);
    expect(t.capture).not.toHaveBeenCalled();
  });
});

describe('createSyncRunner', () => {
  it('shares one pass between simultaneous triggers', async () => {
    const t = setup({}, { pending: vi.fn().mockResolvedValue([req('r1')]) });
    const run = createSyncRunner(t.deps);
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toBe(b);
    expect(t.posted).toHaveLength(1);
    // A later trigger runs a fresh pass.
    await run();
    expect(t.api.pending).toHaveBeenCalledTimes(2);
  });
});
