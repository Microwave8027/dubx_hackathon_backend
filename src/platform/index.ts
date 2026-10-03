import { createBrowserPlatform } from './browser';
import { createTauriPlatform } from './tauri';
import type { Platform } from './types';

export type { NotifyOptions, Platform, TrayState } from './types';

export function detectTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let current: Platform | null = null;

/** The runtime is detected once; every component goes through this adapter. */
export function getPlatform(): Platform {
  current ??= detectTauri() ? createTauriPlatform() : createBrowserPlatform();
  return current;
}

/** Test seam. */
export function setPlatformForTests(platform: Platform | null): void {
  current = platform;
}
