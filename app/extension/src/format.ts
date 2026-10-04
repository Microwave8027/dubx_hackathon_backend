import type { StoredState } from './storage';

/** "just now", "5 minutes ago", or a date for anything older than a day. */
export function formatWhen(at: number | null, now: number = Date.now()): string {
  if (!at) return 'never';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) {
    const m = Math.max(1, Math.round(s / 60));
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (s < 86_400) {
    const h = Math.round(s / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  return new Date(at).toLocaleString();
}

export type Connection = 'connected' | 'needs-consent' | 'needs-token';

/** What the popup should say. "Connected" means set up, not that the last request worked. */
export function connectionOf(state: Pick<StoredState, 'consented' | 'settings'>): Connection {
  if (!state.consented) return 'needs-consent';
  if (!state.settings.apiBase || !state.settings.token) return 'needs-token';
  return 'connected';
}
