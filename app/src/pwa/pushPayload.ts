// Shared by the service worker and tests. Assumed payload: { title, body?, url? } (see PR notes).
export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

export function parsePushPayload(text: string | undefined): PushPayload {
  const fallback: PushPayload = { title: 'Command Center' };
  if (!text) return fallback;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return { title: text.slice(0, 120) };
    const o = raw as Record<string, unknown>;
    return {
      title: typeof o.title === 'string' && o.title ? o.title : fallback.title,
      body: typeof o.body === 'string' ? o.body : undefined,
      url: typeof o.url === 'string' ? o.url : undefined,
    };
  } catch {
    return { title: text.slice(0, 120) };
  }
}

/** Only same-origin paths may be opened from a notification. */
export function safeDeepLink(url: string | undefined, origin: string): string {
  if (!url) return '/';
  try {
    const u = new URL(url, origin);
    return u.origin === origin ? `${u.pathname}${u.search}${u.hash}` : '/';
  } catch {
    return '/';
  }
}
