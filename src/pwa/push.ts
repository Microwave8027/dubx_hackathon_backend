import type { ApiClient } from '@/api/client';
import { isIos, isStandalone } from './installPrompt';

export type PushSupport =
  { ok: true } | { ok: false; reason: 'unsupported' | 'ios-needs-install' | 'denied' };

export function pushSupport(): PushSupport {
  // iOS only exposes Web Push to the installed (Home Screen) app.
  if (isIos() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' };
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  return { ok: true };
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export class PushError extends Error {
  constructor(
    message: string,
    readonly code: 'permission' | 'not-configured' | 'failed',
  ) {
    super(message);
    this.name = 'PushError';
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Must be called from a user gesture (the permission prompt requires it on most browsers). */
export async function enablePush(client: Pick<ApiClient, 'getVapidKey' | 'subscribePush'>) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushError('Notifications are blocked for this app.', 'permission');
  }
  const { publicKey } = await client.getVapidKey();
  if (!publicKey) throw new PushError('The agent has no push key configured.', 'not-configured');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  // The backend stores this to send pushes: endpoint plus p256dh/auth keys.
  await client.subscribePush(subscription.toJSON());
  return subscription;
}

export async function disablePush(): Promise<void> {
  const sub = await getExistingSubscription();
  await sub?.unsubscribe();
}
