import { z } from 'zod';
import { decryptEnvelope, encryptEnvelope, type KeyPair } from '@/crypto/envelope';
import type { EventsConnection, EventsHandlers, Transport, TransportResponse } from './types';

/*
 * TODO(backend): relay wire protocol is NOT finalized. Assumptions made here:
 *   - request:  POST {relayUrl}/v1/relay/{deviceId}   body = Envelope of { method, path, body }
 *               response body = Envelope of { status, json }
 *   - events:   WebSocket {relayUrl}/v1/relay/{deviceId}/events; every frame is an Envelope whose
 *               payload is one server event (the same JSON the direct /events socket sends)
 * Only the relay URL scheme and these two shapes need to change when the backend settles.
 */

export interface RelayConfig {
  relayUrl: string;
  deviceId: string;
  /** This device's keys (generated at pairing). */
  keys: KeyPair;
  /** The daemon's public key, learned during pairing. Envelopes from other keys are rejected. */
  daemonPublicKey: Uint8Array;
  fetch?: typeof fetch;
  createSocket?: (url: string) => WebSocket;
}

const ResponsePayload = z.object({ status: z.number().int(), json: z.unknown() });

export function createRelayTransport(cfg: RelayConfig): Transport {
  const base = `${cfg.relayUrl.replace(/\/+$/, '')}/v1/relay/${encodeURIComponent(cfg.deviceId)}`;
  const doFetch = cfg.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const makeSocket = cfg.createSocket ?? ((url: string) => new WebSocket(url));

  return {
    kind: 'relay',

    async request(method, path, body): Promise<TransportResponse> {
      const envelope = encryptEnvelope({ method, path, body }, cfg.daemonPublicKey, cfg.keys);
      const res = await doFetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      // A relay-level failure (unknown device, daemon offline) has no encrypted body.
      if (!res.ok) return { status: res.status, json: null };
      const inner = ResponsePayload.safeParse(
        decryptEnvelope(await res.json(), cfg.daemonPublicKey, cfg.keys),
      );
      if (!inner.success) return { status: 502, json: null };
      return { status: inner.data.status, json: inner.data.json ?? null };
    },

    openEvents(handlers: EventsHandlers): EventsConnection {
      const ws = makeSocket(`${base.replace(/^http/, 'ws')}/events`);
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = (m: MessageEvent) => {
        if (typeof m.data !== 'string') return;
        try {
          const payload = decryptEnvelope(JSON.parse(m.data), cfg.daemonPublicKey, cfg.keys);
          handlers.onMessage(JSON.stringify(payload));
        } catch {
          // Drop anything we cannot authenticate; never surface or log its contents.
        }
      };
      ws.onclose = () => handlers.onClose();
      ws.onerror = () => ws.close();
      return {
        close() {
          ws.onclose = null;
          ws.onerror = null;
          ws.onmessage = null;
          if (ws.readyState === 0) ws.onopen = () => ws.close();
          else ws.close();
        },
      };
    },
  };
}
