import { layer } from '@/test/fixtures';
import type { EventsHandlers, Transport } from '@/transport/types';
import { createWsClient, type ConnectionState } from './ws';
import type { ServerEvent } from './types';

interface FakeConn {
  handlers: EventsHandlers;
  closed: boolean;
}

function setup() {
  const conns: FakeConn[] = [];
  const events: ServerEvent[] = [];
  const states: ConnectionState[] = [];
  const connected: boolean[] = [];
  const transport: Transport = {
    kind: 'direct',
    request: () => Promise.reject(new Error('unused')),
    openEvents(handlers) {
      const c: FakeConn = { handlers, closed: false };
      conns.push(c);
      return {
        close() {
          c.closed = true;
        },
      };
    },
  };
  const client = createWsClient({
    transport: () => transport,
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s),
    onConnected: (r) => connected.push(r),
  });
  return { client, conns, events, states, connected };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ws client', () => {
  it('validates events and drops malformed ones', () => {
    const { client, conns, events } = setup();
    client.start();
    const h = conns[0]!.handlers;
    h.onOpen();
    h.onMessage(JSON.stringify({ type: 'layer.updated', data: layer() }));
    h.onMessage(JSON.stringify({ type: 'layer.updated', data: { id: 1 } }));
    h.onMessage('not json');
    h.onMessage(JSON.stringify({ type: 'nope', data: {} }));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('layer.updated');
  });

  it('reconnects with backoff 1s to 15s and flags reconnects', () => {
    const { client, conns, connected, states } = setup();
    client.start();
    conns[0]!.handlers.onOpen();
    expect(connected).toEqual([false]);

    const delays = [1000, 2000, 4000, 8000, 15000, 15000];
    delays.forEach((d, i) => {
      conns[i]!.handlers.onClose();
      vi.advanceTimersByTime(d - 1);
      expect(conns).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(conns).toHaveLength(i + 2);
    });
    expect(states).toContain('reconnecting');

    conns.at(-1)!.handlers.onOpen();
    expect(connected).toEqual([false, true]);
  });

  it('resets backoff after a successful connection', () => {
    const { client, conns } = setup();
    client.start();
    conns[0]!.handlers.onClose();
    vi.advanceTimersByTime(1000);
    conns[1]!.handlers.onClose();
    vi.advanceTimersByTime(2000);
    conns[2]!.handlers.onOpen();
    conns[2]!.handlers.onClose();
    vi.advanceTimersByTime(1000);
    expect(conns).toHaveLength(4);
  });

  it('stop() closes the connection and does not reconnect', () => {
    const { client, conns, states } = setup();
    client.start();
    client.stop();
    expect(conns[0]!.closed).toBe(true);
    vi.advanceTimersByTime(60000);
    expect(conns).toHaveLength(1);
    expect(states.at(-1)).toBe('closed');
  });

  it('ignores late callbacks from a connection that was stopped', () => {
    const { client, conns, events, connected } = setup();
    client.start();
    const old = conns[0]!.handlers;
    client.stop();
    old.onOpen();
    old.onMessage(JSON.stringify({ type: 'layer.updated', data: layer() }));
    old.onClose();
    expect(events).toHaveLength(0);
    expect(connected).toHaveLength(0);
    vi.advanceTimersByTime(60000);
    expect(conns).toHaveLength(1);
  });

  it('schedules a retry when opening the connection throws', () => {
    const { client } = setup();
    const events: ConnectionState[] = [];
    const failing = createWsClient({
      transport: () => ({
        kind: 'direct',
        request: () => Promise.reject(new Error('unused')),
        openEvents: () => {
          throw new Error('bad url');
        },
      }),
      onEvent: () => {},
      onState: (s) => events.push(s),
      onConnected: () => {},
    });
    failing.start();
    expect(events).toContain('reconnecting');
    failing.stop();
    client.stop();
  });
});
