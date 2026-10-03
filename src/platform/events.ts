// Events raised by the native shell (tray, notifications) for the app to act on.
// Keeps Tauri out of components: the adapter emits, a bridge component listens.
export type PlatformEvent =
  { type: 'pause-all' } | { type: 'tray-click' } | { type: 'deep-link'; path: string };

type Handler = (event: PlatformEvent) => void;
const handlers = new Set<Handler>();

export function onPlatformEvent(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitPlatformEvent(event: PlatformEvent): void {
  handlers.forEach((h) => h(event));
}
