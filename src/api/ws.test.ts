import { layer } from '@/test/fixtures';
import { createWsClient, type ConnectionState } from './ws';
import type { ServerEvent } from './types';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function setup() {
  FakeSocket.instances = [];
  const events: ServerEvent[] = [];
  const states: ConnectionState[] = [];
  const connected: boolean[] = [];
  const client = createWsClient({
    url: () => 'ws://test/events',
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s),
    onConnected: (r) => connected.push(r),
    createSocket: (u) => new FakeSocket(u) as unknown as WebSocket,
  });
  return { client, events, states, connected };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ws client', () => {
  it('validates events and drops malformed ones', () => {
    const { client, events } = setup();
    client.start();
    const s = FakeSocket.instances[0]!;
    s.onopen?.();
    s.onmessage?.({ data: JSON.stringify({ type: 'layer.updated', data: layer() }) });
    s.onmessage?.({ data: JSON.stringify({ type: 'layer.updated', data: { id: 1 } }) });
    s.onmessage?.({ data: 'not json' });
    s.onmessage?.({ data: JSON.stringify({ type: 'nope', data: {} }) });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('layer.updated');
  });

  it('reconnects with backoff 1s to 15s and flags reconnects', () => {
    const { client, connected, states } = setup();
    client.start();
    FakeSocket.instances[0]!.onopen?.();
    expect(connected).toEqual([false]);

    const delays = [1000, 2000, 4000, 8000, 15000, 15000];
    delays.forEach((d, i) => {
      FakeSocket.instances[i]!.onclose?.();
      vi.advanceTimersByTime(d - 1);
      expect(FakeSocket.instances).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.instances).toHaveLength(i + 2);
    });
    expect(states).toContain('reconnecting');

    FakeSocket.instances.at(-1)!.onopen?.();
    expect(connected).toEqual([false, true]);
  });

  it('resets backoff after a successful connection', () => {
    const { client } = setup();
    client.start();
    FakeSocket.instances[0]!.onclose?.();
    vi.advanceTimersByTime(1000);
    FakeSocket.instances[1]!.onclose?.();
    vi.advanceTimersByTime(2000);
    FakeSocket.instances[2]!.onopen?.();
    FakeSocket.instances[2]!.onclose?.();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('stop() closes the socket and does not reconnect', () => {
    const { client, states } = setup();
    client.start();
    client.stop();
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(states.at(-1)).toBe('closed');
  });
});
