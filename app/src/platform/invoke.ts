import { detectTauri } from './index';

/**
 * Calls a Rust command (Tauri 2: invoke from @tauri-apps/api/core). Loaded lazily so the
 * web/PWA bundle never pulls the Tauri API. Desktop only.
 */
export async function invokeCommand<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!detectTauri()) throw new Error('Native commands are only available in the desktop app');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
