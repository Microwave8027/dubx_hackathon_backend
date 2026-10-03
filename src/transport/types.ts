export interface TransportResponse {
  status: number;
  /** Parsed JSON body, or null when there is none. Callers validate it with Zod. */
  json: unknown;
}

export interface EventsHandlers {
  onOpen(): void;
  /** One server event as a JSON string. */
  onMessage(data: string): void;
  onClose(): void;
}

export interface EventsConnection {
  close(): void;
}

/** How the app reaches the agent: straight to the daemon, or through the encrypted relay. */
export interface Transport {
  readonly kind: 'direct' | 'relay';
  request(method: string, path: string, body?: unknown): Promise<TransportResponse>;
  openEvents(handlers: EventsHandlers): EventsConnection;
}
