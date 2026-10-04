import { vi } from 'vitest';
import type { Transport } from '@/transport/types';

const request = vi.fn();
vi.mock('@/transport', () => ({ getTransport: () => ({ request }) as unknown as Transport }));

import { disconnectGoogle, getGoogleStatus, isSafeAuthUrl, startGoogleConnect } from './google';

beforeEach(() => {
  request.mockReset();
});

describe('google link client', () => {
  it('reads the connection status', async () => {
    request.mockResolvedValue({
      status: 200,
      json: { connected: true, account: 'me@example.com' },
    });
    await expect(getGoogleStatus()).resolves.toEqual({
      connected: true,
      account: 'me@example.com',
    });
    expect(request).toHaveBeenCalledWith('GET', '/integrations/google-calendar');
  });

  it('starts a connection and returns the consent URL', async () => {
    request.mockResolvedValue({
      status: 200,
      json: { authUrl: 'https://accounts.google.com/o/oauth2/auth?x=1' },
    });
    await expect(startGoogleConnect()).resolves.toMatchObject({
      authUrl: expect.stringContaining('accounts.google.com'),
    });
    expect(request).toHaveBeenCalledWith('POST', '/integrations/google-calendar/connect');
  });

  it('disconnects', async () => {
    request.mockResolvedValue({ status: 204, json: null });
    await expect(disconnectGoogle()).resolves.toEqual({});
    expect(request).toHaveBeenCalledWith('DELETE', '/integrations/google-calendar');
  });

  it('turns an error status or a bad body into an error', async () => {
    request.mockResolvedValue({ status: 404, json: null });
    await expect(getGoogleStatus()).rejects.toMatchObject({ status: 404 });
    request.mockResolvedValue({ status: 200, json: { connected: 'yes' } });
    await expect(getGoogleStatus()).rejects.toThrow(/Unexpected response/);
  });
});

describe('isSafeAuthUrl', () => {
  it('only allows https', () => {
    expect(isSafeAuthUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    expect(isSafeAuthUrl('http://accounts.google.com')).toBe(false);
    expect(isSafeAuthUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeAuthUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeAuthUrl('not a url')).toBe(false);
  });
});
