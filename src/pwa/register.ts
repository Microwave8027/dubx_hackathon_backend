import { detectTauri, emitPlatformEvent } from '@/platform';

/** Registers the service worker (production web builds only, never inside Tauri). */
export function registerServiceWorker(): void {
  if (detectTauri() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // Notification clicks arrive as messages when the app is already open.
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const d = event.data;
    if (
      typeof d === 'object' &&
      d !== null &&
      'type' in d &&
      d.type === 'deep-link' &&
      'path' in d &&
      typeof d.path === 'string'
    ) {
      emitPlatformEvent({ type: 'deep-link', path: d.path });
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline install is a nice-to-have; the app still works without it */
    });
  });
}
