// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENSION_ID, createExtensionApi } from './extension.js';

const api = createExtensionApi();
const EXT_ORIGIN = `chrome-extension://${DEFAULT_EXTENSION_ID}`;
let base = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use(api.router);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => api.reset());

const json = (res: Response) => res.json() as Promise<Record<string, unknown>>;
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function newToken() {
  const res = await post('/api/extension/tokens');
  return (await json(res)) as { id: string; token: string; createdAt: string };
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const tab = (i = 0) => ({
  url: `https://example.com/${i}`,
  title: `Tab ${i}`,
  windowId: 1,
  index: i,
  pinned: false,
  groupId: -1,
});
function snapshot(requestId: string, over: Record<string, unknown> = {}) {
  return {
    requestId,
    configId: 'profile',
    deviceId: randomUUID(),
    deviceName: 'Chrome on mac',
    capturedAt: new Date().toISOString(),
    tabs: [tab(0), tab(1)],
    ...over,
  };
}

describe('the extension id', () => {
  it('matches the key in the extension manifest', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.template.json', 'utf8'));
    const der = Buffer.from(manifest.key as string, 'base64');
    const id = createHash('sha256')
      .update(der)
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)));
    expect(id).toBe(DEFAULT_EXTENSION_ID);
  });
});

describe('tokens', () => {
  it('shows the token once and stores only its SHA-256 hash', async () => {
    const { id, token } = await newToken();
    expect(token).toMatch(/^cct_/);
    const stored = api._storedTokens();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);

    const listed = await json(await fetch(base + '/api/extension/tokens')).then(
      (x) => x as unknown as unknown[],
    );
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed).toEqual([{ id, createdAt: expect.any(String), lastUsedAt: null }]);
  });

  it('can be revoked, after which it stops working', async () => {
    const { id, token } = await newToken();
    expect((await fetch(base + '/api/extension/me', { headers: bearer(token) })).status).toBe(200);
    expect((await fetch(`${base}/api/extension/tokens/${id}`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await fetch(base + '/api/extension/me', { headers: bearer(token) })).status).toBe(401);
    expect((await fetch(`${base}/api/extension/tokens/${id}`, { method: 'DELETE' })).status).toBe(
      404,
    );
    expect(await json(await fetch(base + '/api/extension/tokens'))).toEqual([]);
  });

  it('limits how many are active at once', async () => {
    for (let i = 0; i < 10; i++) expect((await post('/api/extension/tokens')).status).toBe(201);
    expect((await post('/api/extension/tokens')).status).toBe(409);
  });

  it('records when a token was last used', async () => {
    const { token } = await newToken();
    await fetch(base + '/api/extension/me', { headers: bearer(token) });
    expect(api._storedTokens()[0]?.lastUsedAt).toEqual(expect.any(String));
  });
});

describe('auth', () => {
  it.each([
    ['no header', {}],
    ['a malformed header', { Authorization: 'Token abc' }],
    ['an unknown token', { Authorization: 'Bearer cct_nope' }],
    ['the session cookie instead of a token', { Cookie: 'session=abc' }],
  ])('rejects %s on every extension endpoint', async (_name, headers) => {
    const id = randomUUID();
    expect((await fetch(base + '/api/extension/me', { headers })).status).toBe(401);
    expect((await fetch(`${base}/api/extension/pending?deviceId=${id}`, { headers })).status).toBe(
      401,
    );
    expect((await post('/api/tab-snapshots', snapshot(randomUUID()), headers)).status).toBe(401);
  });

  it('accepts a valid token and identifies the user', async () => {
    const { token } = await newToken();
    const res = await fetch(base + '/api/extension/me', { headers: bearer(token) });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ userId: 'demo-user' });
  });
});

describe('pending', () => {
  it('lists sync requests this device has not answered, newest first', async () => {
    const { token } = await newToken();
    const a = api.createSyncRequest('profile');
    await new Promise((r) => setTimeout(r, 5));
    const b = api.createSyncRequest('profile');
    const device = randomUUID();
    const res = await fetch(`${base}/api/extension/pending?deviceId=${device}`, {
      headers: bearer(token),
    });
    const { requests } = (await json(res)) as { requests: { requestId: string }[] };
    expect(requests.map((r) => r.requestId)).toEqual([b.requestId, a.requestId]);
  });

  it('stops listing a request once this device posted its snapshot, but not for other devices', async () => {
    const { token } = await newToken();
    const r = api.createSyncRequest('profile');
    const device = randomUUID();
    await post('/api/tab-snapshots', snapshot(r.requestId, { deviceId: device }), bearer(token));
    const mine = await json(
      await fetch(`${base}/api/extension/pending?deviceId=${device}`, { headers: bearer(token) }),
    );
    const other = await json(
      await fetch(`${base}/api/extension/pending?deviceId=${randomUUID()}`, {
        headers: bearer(token),
      }),
    );
    expect(mine.requests).toEqual([]);
    expect((other.requests as unknown[]).length).toBe(1);
  });

  it('requires a device id', async () => {
    const { token } = await newToken();
    const res = await fetch(base + '/api/extension/pending', { headers: bearer(token) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tab-snapshots', () => {
  it('stores a valid snapshot', async () => {
    const { token } = await newToken();
    const r = api.createSyncRequest('profile');
    const res = await post('/api/tab-snapshots', snapshot(r.requestId), bearer(token));
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, duplicate: false });
    expect(api.listSnapshots()).toHaveLength(1);
    expect(api.listSnapshots()[0]).toMatchObject({ userId: 'demo-user', requestId: r.requestId });
  });

  it('is idempotent: a retry for the same user, request and device stores nothing new', async () => {
    const { token } = await newToken();
    const r = api.createSyncRequest('profile');
    const body = snapshot(r.requestId);
    expect((await post('/api/tab-snapshots', body, bearer(token))).status).toBe(201);
    const retry = await post('/api/tab-snapshots', { ...body, tabs: [tab(9)] }, bearer(token));
    expect(retry.status).toBe(200);
    expect(await json(retry)).toEqual({ ok: true, duplicate: true });
    expect(api.listSnapshots()).toHaveLength(1);
    expect((api.listSnapshots()[0] as { tabs: unknown[] }).tabs).toHaveLength(2); // the first one stands
  });

  it('keeps one snapshot per device for the same request', async () => {
    const { token } = await newToken();
    const r = api.createSyncRequest('profile');
    await post('/api/tab-snapshots', snapshot(r.requestId), bearer(token));
    await post('/api/tab-snapshots', snapshot(r.requestId), bearer(token));
    expect(api.listSnapshots()).toHaveLength(2);
  });

  it('refuses a request id that does not exist or a config that does not match', async () => {
    const { token } = await newToken();
    expect((await post('/api/tab-snapshots', snapshot(randomUUID()), bearer(token))).status).toBe(
      404,
    );
    const r = api.createSyncRequest('profile');
    const res = await post(
      '/api/tab-snapshots',
      snapshot(r.requestId, { configId: 'other' }),
      bearer(token),
    );
    expect(res.status).toBe(422);
  });

  describe('validation', () => {
    async function invalid(over: Record<string, unknown>) {
      const { token } = await newToken();
      const r = api.createSyncRequest('profile');
      const res = await post('/api/tab-snapshots', snapshot(r.requestId, over), bearer(token));
      expect(res.status).toBe(400);
      expect(((await json(res)) as { error: string }).error).toBe('invalid_body');
      expect(api.listSnapshots()).toHaveLength(0);
    }
    it('requires every field', async () => {
      const { token } = await newToken();
      const r = api.createSyncRequest('profile');
      const rest: Record<string, unknown> = snapshot(r.requestId);
      delete rest.deviceName;
      expect((await post('/api/tab-snapshots', rest, bearer(token))).status).toBe(400);
    });
    it('rejects bad ids and dates', async () => {
      await invalid({ deviceId: 'not-a-uuid' });
      await invalid({ requestId: 'nope' });
      await invalid({ capturedAt: 'yesterday' });
    });
    it('rejects non-web urls and wrongly typed tab fields', async () => {
      await invalid({ tabs: [{ ...tab(), url: 'chrome://settings' }] });
      await invalid({ tabs: [{ ...tab(), url: 'file:///etc/passwd' }] });
      await invalid({ tabs: [{ ...tab(), pinned: 'yes' }] });
      await invalid({ tabs: [{ ...tab(), index: -1 }] });
      await invalid({ tabs: [{ ...tab(), title: 'x'.repeat(2000) }] });
    });
    it('caps tabs at 500', async () => {
      const { token } = await newToken();
      const r = api.createSyncRequest('profile');
      const ok = Array.from({ length: 500 }, (_, i) => tab(i));
      expect(
        (await post('/api/tab-snapshots', snapshot(r.requestId, { tabs: ok }), bearer(token)))
          .status,
      ).toBe(201);
      const r2 = api.createSyncRequest('profile');
      const tooMany = Array.from({ length: 501 }, (_, i) => tab(i));
      expect(
        (await post('/api/tab-snapshots', snapshot(r2.requestId, { tabs: tooMany }), bearer(token)))
          .status,
      ).toBe(400);
    });
    it('rejects bodies over 1 MB and malformed JSON', async () => {
      const { token } = await newToken();
      const r = api.createSyncRequest('profile');
      const huge = { ...snapshot(r.requestId), junk: 'x'.repeat(1_100_000) };
      const big = await post('/api/tab-snapshots', huge, bearer(token));
      expect(big.status).toBe(413);
      expect(await json(big)).toEqual({ error: 'body_too_large' });
      const bad = await fetch(base + '/api/tab-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(token) },
        body: '{not json',
      });
      expect(bad.status).toBe(400);
    });
  });
});

describe('CORS', () => {
  const get = (path: string, origin?: string, headers: Record<string, string> = {}) =>
    fetch(base + path, { headers: { ...(origin ? { Origin: origin } : {}), ...headers } });

  it('answers the extension origin, and only that origin', async () => {
    const { token } = await newToken();
    const ok = await get('/api/extension/me', EXT_ORIGIN, bearer(token));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
    expect(ok.headers.get('vary')).toContain('Origin');

    for (const origin of [
      'https://evil.example',
      'chrome-extension://someotherextensionidxxxxxxxxxx',
      'http://localhost:1420',
    ]) {
      const res = await get('/api/extension/me', origin, bearer(token));
      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('handles the preflight for the extension origin and refuses everyone else', async () => {
    const pre = (origin: string) =>
      fetch(base + '/api/tab-snapshots', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
    const ok = await pre(EXT_ORIGIN);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
    expect(ok.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
    expect((await pre('https://evil.example')).status).toBe(403);
  });

  it('never sets a wildcard or allows credentials on the extension endpoints', async () => {
    const res = await get('/api/extension/me', EXT_ORIGIN);
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
