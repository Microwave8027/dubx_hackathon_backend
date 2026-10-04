import { z } from 'zod';
import { ApiError } from '@/transport/errors';
import { getTransport } from '@/transport';

/*
 * Linking Google Calendar. The backend owns OAuth (tokens never reach the UI); these endpoints are
 * ASSUMED, not agreed, and are flagged in the PR. If they differ, only this file changes.
 *
 *   GET    /integrations/google-calendar              -> { connected, account? }
 *   POST   /integrations/google-calendar/connect      -> { authUrl } (open it) or { connected: true }
 *   DELETE /integrations/google-calendar              -> 204 / { connected: false }
 */
const BASE = '/integrations/google-calendar';

export const GoogleStatusSchema = z.object({
  connected: z.boolean(),
  /** The linked Google account, for display, e.g. an email address. */
  account: z.string().nullish(),
});
export type GoogleStatus = z.infer<typeof GoogleStatusSchema>;

export const ConnectResultSchema = z.object({
  authUrl: z.string().url().optional(),
  connected: z.boolean().optional(),
  account: z.string().nullish(),
});
export type ConnectResult = z.infer<typeof ConnectResultSchema>;

async function call<T>(schema: z.ZodType<T>, method: string, path: string): Promise<T> {
  const res = await getTransport().request(method, path);
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(`${method} ${path} failed (${res.status})`, res.status);
  }
  const parsed = schema.safeParse(res.json ?? {});
  if (!parsed.success) throw new ApiError(`Unexpected response from ${method} ${path}`, res.status);
  return parsed.data;
}

export const getGoogleStatus = () => call(GoogleStatusSchema, 'GET', BASE);
export const startGoogleConnect = () => call(ConnectResultSchema, 'POST', `${BASE}/connect`);
export const disconnectGoogle = () =>
  call(z.object({ connected: z.boolean().optional() }), 'DELETE', BASE);

/** Only ever send the user to a Google page over https; anything else is refused. */
export function isSafeAuthUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
