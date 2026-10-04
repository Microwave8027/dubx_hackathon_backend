import { vi } from 'vitest';
import { ApiError, createApi, normalizeApiBase } from './api';
import type { SnapshotBody } from './contract';

const snapshot: SnapshotBody = {
  requestId: 'r1',
  configId: 'c1',
  deviceId: 'd1',
  deviceName: 'Chrome',
  capturedAt: '2026-01-01T00:00:00Z',
  tabs: [],
};

const reply = (status: number, json?: unknown) =>
  vi
    .fn()
    .mockResolvedValue(new Response(json === undefined ? null : JSON.stringify(json), { status }));

describe('normalizeApiBase', () => {
  it('keeps the origin only', () => {
    expect(normalizeApiBase(' https://app.example.com/some/path?x=1 ')).toBe(
      'https://app.example.com',
    );
    expect(normalizeApiBase('http://localhost:8787/')).toBe('http://localhost:8787');
  });
  it('rejects other schemes and junk', () => {
    expect(() => normalizeApiBase('ftp://x.example')).toThrow(/https/);
    expect(() => normalizeApiBase('javascript:alert(1)')).toThrow();
    expect(() => normalizeApiBase('app.example.com')).toThrow(/full URL/);
  });
});

describe('api client', () => {
  it('sends the bearer token and never cookies', async () => {
    const fetchMock = reply(200, { userId: 'u1' });
    await createApi('https://x.example', 'tok', fetchMock).me();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.example/api/extension/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.credentials).toBe('omit');
  });

  it('asks for this device’s pending requests', async () => {
    const fetchMock = reply(200, { requests: [{ requestId: 'r', configId: 'c', createdAt: 't' }] });
    const list = await createApi('https://x.example', 't', fetchMock).pending('dev 1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://x.example/api/extension/pending?deviceId=dev%201',
    );
    expect(list).toEqual([{ requestId: 'r', configId: 'c', createdAt: 't' }]);
  });

  it('posts a snapshot as JSON and reports duplicates', async () => {
    const fetchMock = reply(200, { ok: true, duplicate: true });
    const result = await createApi('https://x.example', 't', fetchMock).postSnapshot(snapshot);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(snapshot);
    expect(result.duplicate).toBe(true);
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [400, 'rejected', false],
    [413, 'rejected', false],
    [429, 'server', true],
    [500, 'server', true],
    [503, 'server', true],
  ])('classifies HTTP %i as %s (retryable: %s)', async (status, kind, retryable) => {
    const err = await createApi('https://x.example', 't', reply(status, {}))
      .me()
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind, retryable });
  });

  it('treats a failed fetch as a retryable network error', async () => {
    const err = await createApi(
      'https://x.example',
      't',
      vi.fn().mockRejectedValue(new TypeError('x')),
    )
      .me()
      .catch((e) => e);
    expect(err).toMatchObject({ kind: 'network', retryable: true });
  });

  it('rejects a response that is not the expected shape', async () => {
    const err = await createApi('https://x.example', 't', reply(200, { requests: [{ nope: 1 }] }))
      .pending('d')
      .catch((e) => e);
    expect(err).toMatchObject({ kind: 'rejected' });
  });
});
