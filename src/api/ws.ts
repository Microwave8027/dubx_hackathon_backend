import { ServerEventSchema } from './schemas';
import type { ServerEvent } from './types';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface WsClientOptions {
  url: () => string;
  onEvent(event: ServerEvent): void;
  onState(state: ConnectionState): void;
  /** Called after every successful (re)connect so callers can refetch everything. */
  onConnected(isReconnect: boolean): void;
  createSocket?: (url: string) => WebSocket;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface WsClient {
  start(): void;
  stop(): void;
}

export function createWsClient(opts: WsClientOptions): WsClient {
  const min = opts.minDelayMs ?? 1000;
  const max = opts.maxDelayMs ?? 15000;
  const make = opts.createSocket ?? ((u: string) => new WebSocket(u));
  let socket: WebSocket | null = null;
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
    let ws: WebSocket;
    try {
      ws = make(opts.url());
    } catch {
      schedule();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      const isReconnect = hasConnected;
      hasConnected = true;
      delay = min;
      opts.onState('open');
      opts.onConnected(isReconnect);
    };
    ws.onmessage = (msg: MessageEvent) => {
      if (typeof msg.data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(msg.data);
      } catch {
        return;
      }
      const parsed = ServerEventSchema.safeParse(raw);
      // Unknown or malformed events are dropped rather than trusted.
      if (parsed.success) opts.onEvent(parsed.data);
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      schedule();
    };
    ws.onerror = () => {
      ws.close();
    };
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
      const s = socket;
      socket = null;
      if (s) {
        s.onclose = null;
        s.close();
      }
      opts.onState('closed');
    },
  };
}
