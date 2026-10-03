// @vitest-environment node
// tweetnacl rejects jsdom's cross-realm Uint8Array (TextEncoder); real browsers are unaffected.
import { generateKeyPair, decryptEnvelope, encryptEnvelope } from '@/crypto/envelope';
import { createRelayTransport } from './relay';

const phone = generateKeyPair();
const daemon = generateKeyPair();

/** A fake relay+daemon: decrypts the request, answers with an encrypted response. */
function fakeRelay(handler: (req: { method: string; path: string; body?: unknown }) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const req = decryptEnvelope(JSON.parse(String(init.body)), phone.publicKey, daemon) as {
      method: string;
      path: string;
      body?: unknown;
    };
    const reply = handler(req);
    return new Response(JSON.stringify(encryptEnvelope(reply, phone.publicKey, daemon)), {
      status: 200,
    });
  });
  return { fetchImpl, calls };
}

const make = (fetchImpl: unknown, createSocket?: (u: string) => WebSocket) =>
  createRelayTransport({
    relayUrl: 'https://relay.test/',
    deviceId: 'dev 1',
    keys: phone,
    daemonPublicKey: daemon.publicKey,
    fetch: fetchImpl as typeof fetch,
    createSocket,
  });

describe('RelayTransport', () => {
  it('sends an encrypted request and decrypts the response', async () => {
    const { fetchImpl, calls } = fakeRelay((req) => ({
      status: 200,
      json: [{ echoed: req.path }],
    }));
    const t = make(fetchImpl);
    const res = await t.request('GET', '/tasks');
    expect(res).toEqual({ status: 200, json: [{ echoed: '/tasks' }] });
    expect(t.kind).toBe('relay');
    expect(calls[0]?.url).toBe('https://relay.test/v1/relay/dev%201');
    // The path and method never travel in the clear.
    expect(String(calls[0]?.init.body)).not.toContain('/tasks');
  });

  it('carries request bodies and non-2xx statuses from the daemon', async () => {
    const seen: unknown[] = [];
    const { fetchImpl } = fakeRelay((req) => {
      seen.push(req.body);
      return { status: 409, json: { error: 'not_undoable' } };
    });
    const res = await make(fetchImpl).request('POST', '/log/x/undo', { why: 'test' });
    expect(seen).toEqual([{ why: 'test' }]);
    expect(res.status).toBe(409);
  });

  it('reports relay-level failures by status without trying to decrypt', async () => {
    const f = vi.fn().mockResolvedValue(new Response('no such device', { status: 404 }));
    expect(await make(f).request('GET', '/tasks')).toEqual({ status: 404, json: null });
  });

  it('rejects a response not signed by the paired daemon', async () => {
    const stranger = generateKeyPair();
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(encryptEnvelope({ status: 200, json: [] }, phone.publicKey, stranger)),
        ),
      );
    await expect(make(f).request('GET', '/tasks')).rejects.toThrow('Unexpected sender');
  });

  it('decrypts event frames and drops forged or garbled ones', () => {
    class Sock {
      static last: Sock;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((m: { data: unknown }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly url: string) {
        Sock.last = this;
      }
      close() {}
    }
    const got: string[] = [];
    make(vi.fn(), (u) => new Sock(u) as unknown as WebSocket).openEvents({
      onOpen: () => {},
      onClose: () => {},
      onMessage: (d) => got.push(d),
    });
    expect(Sock.last.url).toBe('wss://relay.test/v1/relay/dev%201/events');
    const event = { type: 'task.updated', data: { id: 't1' } };
    Sock.last.onmessage?.({
      data: JSON.stringify(encryptEnvelope(event, phone.publicKey, daemon)),
    });
    Sock.last.onmessage?.({
      data: JSON.stringify(encryptEnvelope(event, phone.publicKey, generateKeyPair())),
    });
    Sock.last.onmessage?.({ data: 'garbage' });
    expect(got.map((g) => JSON.parse(g))).toEqual([event]);
  });
});
