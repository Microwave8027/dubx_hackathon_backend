const OVERRIDE_KEY = 'cc.apiUrl';

/** Base URL: user override (Settings) wins, then VITE_API_URL. Empty means same origin. */
export function getApiUrl(): string {
  try {
    const override = localStorage.getItem(OVERRIDE_KEY);
    if (override) return override.replace(/\/+$/, '');
  } catch {
    /* storage unavailable */
  }
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
}

export function setApiUrlOverride(url: string | null): void {
  try {
    if (url) localStorage.setItem(OVERRIDE_KEY, url);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getWsUrl(apiUrl: string = getApiUrl()): string {
  const base = apiUrl || window.location.origin;
  return `${base.replace(/^http/, 'ws')}/events`;
}
