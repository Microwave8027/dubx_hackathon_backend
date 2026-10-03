import { ServerEventSchema } from './schemas';
import type { EventsConnection, Transport } from '@/transport/types';
import type { ServerEvent } from './types';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface WsClientOptions {
  transport: () => Transport;
  onEvent(event: ServerEvent): void;
  onState(state: ConnectionState): void;
  /** Called after every successful (re)connect so callers can refetch everything. */
  onConnected(isReconnect: boolean): void;
  /** Only these event types are validated and delivered; others are dropped before Zod runs. */
  acceptTypes?: readonly ServerEvent['type'][];
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface WsClient {
  start(): void;
  stop(): void;
}

function acceptsType(raw: unknown, types: readonly string[]): boolean {
  const type = (raw as { type?: unknown } | null)?.type;
  return typeof type === 'string' && types.includes(type);
}

export function createWsClient(opts: WsClientOptions): WsClient {
  const min = opts.minDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 15000;
  let current: EventsConnection | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = min;
  let stopped = true;
  let hasConnected = false;

  function schedule() {
    if (stopped) return;
    opts.onState('reconnecting');
    timer = setTimeout(connect, delay);
    delay = Math.min(delay * 2, max);
  }

  function connect() {
    timer = null;
    if (stopped) return;
    // Callbacks from a connection that has been replaced or stopped are ignored.
    const mine: { conn: EventsConnection | null } = { conn: null };
    const live = () => mine.conn !== null && mine.conn === current;
    try {
      mine.conn = opts.transport().openEvents({
        onOpen: () => {
          if (!live()) return;
          const isReconnect = hasConnected;
          hasConnected = true;
          delay = min;
          opts.onState('open');
          opts.onConnected(isReconnect);
        },
        onMessage: (data) => {
          if (!live()) return;
          let raw: unknown;
          try {
            raw = JSON.parse(data);
          } catch {
            return;
          }
          if (opts.acceptTypes && !acceptsType(raw, opts.acceptTypes)) return;
          const parsed = ServerEventSchema.safeParse(raw);
          // Unknown or malformed events are dropped rather than trusted.
          if (parsed.success) opts.onEvent(parsed.data);
        },
        onClose: () => {
          if (!live()) return;
          current = null;
          schedule();
        },
      });
    } catch {
      schedule();
      return;
    }
    current = mine.conn;
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      hasConnected = false;
      delay = min;
      opts.onState('connecting');
      connect();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const c = current;
      current = null;
      c?.close();
      opts.onState('closed');
    },
  };
}
