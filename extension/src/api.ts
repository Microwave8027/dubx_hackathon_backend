import { parseMe, parsePending, type PendingRequest, type SnapshotBody } from './contract';

export type ApiErrorKind = 'auth' | 'network' | 'server' | 'rejected';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Worth retrying later: the network, a 5xx, or 429. Auth and validation errors are not. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'server';
  }
}

/** Accepts http(s) URLs only, drops the path, query and trailing slash. Throws on anything else. */
export function normalizeApiBase(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a full URL, for example https://app.example.com');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The API URL must start with https:// (or http:// for local testing)');
  }
  return url.origin;
}

const TIMEOUT_MS = 15_000;

export interface Api {
  me(): Promise<{ userId: string }>;
  pending(deviceId: string): Promise<PendingRequest[]>;
  postSnapshot(body: SnapshotBody): Promise<{ duplicate: boolean }>;
}

export function createApi(apiBase: string, token: string, fetchImpl: typeof fetch = fetch): Api {
  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${apiBase}${path}`, {
        ...init,
        signal: ctl.signal,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
        },
        // Never send the user's cookies: the extension has its own token.
        credentials: 'omit',
      });
    } catch {
      throw new ApiError('Could not reach the server.', 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(
        'The token was rejected. Create a new one in the app.',
        'auth',
        res.status,
      );
    }
    if (res.status >= 500 || res.status === 429) {
      throw new ApiError(`The server had a problem (${res.status}).`, 'server', res.status);
    }
    if (!res.ok) {
      throw new ApiError(`The server refused the request (${res.status}).`, 'rejected', res.status);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  return {
    async me() {
      const me = parseMe(await call('/api/extension/me'));
      if (!me) throw new ApiError('Unexpected response from the server.', 'rejected');
      return me;
    },
    async pending(deviceId) {
      const json = await call(`/api/extension/pending?deviceId=${encodeURIComponent(deviceId)}`);
      const requests = parsePending(json);
      if (!requests) throw new ApiError('Unexpected response from the server.', 'rejected');
      return requests;
    },
    async postSnapshot(body) {
      const json = (await call('/api/tab-snapshots', {
        method: 'POST',
        body: JSON.stringify(body),
      })) as { duplicate?: boolean } | null;
      return { duplicate: Boolean(json?.duplicate) };
    },
  };
}
