import { createDirectTransport } from './direct';
import type { EventsHandlers } from './types';

class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

const handlers = (): EventsHandlers & { messages: string[]; calls: string[] } => {
  const messages: string[] = [];
  const calls: string[] = [];
  return {
    messages,
    calls,
    onOpen: () => calls.push('open'),
    onMessage: (d) => messages.push(d),
    onClose: () => calls.push('close'),
  };
};

const make = () =>
  createDirectTransport({
    baseUrl: () => 'https://daemon.test',
    createSocket: (u) => new FakeSocket(u) as unknown as WebSocket,
  });

describe('DirectTransport events', () => {
  it('connects to /events on the same host, switching to wss for https', () => {
    make().openEvents(handlers());
    expect(FakeSocket.last.url).toBe('wss://daemon.test/events');
  });

  it('forwards open, string messages and close; ignores binary frames', () => {
    const h = handlers();
    make().openEvents(h);
    const s = FakeSocket.last;
    s.onopen?.();
    s.onmessage?.({ data: '{"a":1}' });
    s.onmessage?.({ data: new ArrayBuffer(2) });
    s.onclose?.();
    expect(h.calls).toEqual(['open', 'close']);
    expect(h.messages).toEqual(['{"a":1}']);
  });

  it('closes on socket errors so the client can reconnect', () => {
    make().openEvents(handlers());
    FakeSocket.last.onerror?.();
    expect(FakeSocket.last.closed).toBe(true);
  });

  it('close() while open silences callbacks and closes', () => {
    const h = handlers();
    const conn = make().openEvents(h);
    const s = FakeSocket.last;
    s.readyState = 1;
    conn.close();
    expect(s.closed).toBe(true);
    expect(h.calls).toEqual([]); // no onClose callback after an intentional close
  });

  it('close() while still connecting waits for open (avoids a browser warning)', () => {
    const conn = make().openEvents(handlers());
    const s = FakeSocket.last;
    s.readyState = 0;
    conn.close();
    expect(s.closed).toBe(false);
    s.onopen?.();
    expect(s.closed).toBe(true);
  });
});
