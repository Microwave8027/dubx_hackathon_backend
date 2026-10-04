import { EXTENSION_ID } from './constants';

/*
 * The page talks to the extension with chrome.runtime.sendMessage, which exists only in Chrome
 * and only on origins the extension lists in externally_connectable. Everywhere else (other
 * browsers, the desktop app) there is simply no bridge: the extension polls every 30 seconds
 * instead, so nothing is lost.
 */
interface ChromeRuntime {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback: (response?: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

const TIMEOUT_MS = 3000;

function send(message: { type: string }): Promise<unknown | null> {
  const rt = runtime();
  if (!rt?.sendMessage) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    try {
      rt.sendMessage?.(EXTENSION_ID, message, (response) => {
        clearTimeout(timer);
        // Reading lastError marks it handled; "extension not installed" lands here.
        void rt.lastError;
        resolve(rt.lastError ? null : (response ?? null));
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Is the extension installed in this browser and allowed to talk to this page? */
export async function isExtensionInstalled(): Promise<boolean> {
  const res = (await send({ type: 'ping' })) as { ok?: boolean } | null;
  return res?.ok === true;
}

/**
 * Called after a config save: asks the extension on this browser to capture right now instead of
 * waiting for its next poll. Never throws and never blocks the save.
 */
export async function notifyExtensionConfigSaved(): Promise<boolean> {
  const res = (await send({ type: 'check-now' })) as { ok?: boolean } | null;
  return res !== null;
}
