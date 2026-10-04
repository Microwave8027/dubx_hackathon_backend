import { getApiUrl, getWsUrl } from '@/api/config';
import type { EventsConnection, EventsHandlers, Transport, TransportResponse } from './types';

export interface DirectOptions {
  baseUrl?: () => string;
  fetch?: typeof fetch;
  createSocket?: (url: string) => WebSocket;
}

/** REST and WebSocket straight to the daemon. */
export function createDirectTransport(opts: DirectOptions = {}): Transport {
  const baseUrl = opts.baseUrl ?? getApiUrl;
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const makeSocket = opts.createSocket ?? ((url: string) => new WebSocket(url));

  return {
    kind: 'direct',

    async request(method, path, body): Promise<TransportResponse> {
      const res = await doFetch(`${baseUrl()}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        // The backend signs users in with a session cookie, so send it on cross-origin calls.
        credentials: 'include',
      });
      let json: unknown = null;
      if (res.status !== 204) {
        try {
          json = await res.json();
        } catch {
          json = null; // non-JSON error pages are reported by status alone
        }
      }
      return { status: res.status, json };
    },

    openEvents(handlers: EventsHandlers): EventsConnection {
      const ws = makeSocket(getWsUrl(baseUrl()));
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = (m: MessageEvent) => {
        if (typeof m.data === 'string') handlers.onMessage(m.data);
      };
      ws.onclose = () => handlers.onClose();
      ws.onerror = () => ws.close();
      return {
        close() {
          ws.onclose = null;
          ws.onerror = null;
          ws.onmessage = null;
          // Closing a still-connecting socket logs a browser warning (StrictMode mounts twice),
          // so wait for it to open first.
          if (ws.readyState === 0) ws.onopen = () => ws.close();
          else ws.close();
        },
      };
    },
  };
}
