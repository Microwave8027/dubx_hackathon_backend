import { vi } from 'vitest';
import { PushError, enablePush, urlBase64ToUint8Array } from './push';

const toJSON = vi
  .fn()
  .mockReturnValue({ endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } });
const subscribe = vi.fn();
const getSubscription = vi.fn();

function stubBrowser(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue(permission) });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) },
  });
}

beforeEach(() => {
  subscribe.mockReset().mockResolvedValue({ toJSON });
  getSubscription.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url with missing padding', () => {
    expect([...urlBase64ToUint8Array('SGVsbG8')]).toEqual([72, 101, 108, 108, 111]);
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});

describe('enablePush', () => {
  it('subscribes with the VAPID key and sends the subscription to the backend', async () => {
    stubBrowser('granted');
    const client = {
      getVapidKey: vi.fn().mockResolvedValue({ publicKey: 'SGVsbG8' }),
      subscribePush: vi.fn().mockResolvedValue({}),
    };
    await enablePush(client);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    );
    expect(client.subscribePush).toHaveBeenCalledWith({
      endpoint: 'https://push/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('reuses an existing subscription', async () => {
    stubBrowser('granted');
    getSubscription.mockResolvedValue({ toJSON });
    const client = {
      getVapidKey: vi.fn().mockResolvedValue({ publicKey: 'SGVsbG8' }),
      subscribePush: vi.fn().mockResolvedValue({}),
    };
    await enablePush(client);
    expect(subscribe).not.toHaveBeenCalled();
    expect(client.subscribePush).toHaveBeenCalled();
  });

  it('fails clearly when permission is refused', async () => {
    stubBrowser('denied');
    const client = { getVapidKey: vi.fn(), subscribePush: vi.fn() };
    await expect(enablePush(client)).rejects.toMatchObject({ code: 'permission' });
    expect(client.getVapidKey).not.toHaveBeenCalled();
  });

  it('fails clearly when the agent has no push key', async () => {
    stubBrowser('granted');
    const client = {
      getVapidKey: vi.fn().mockResolvedValue({ publicKey: '' }),
      subscribePush: vi.fn(),
    };
    const err = await enablePush(client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PushError);
    expect(err).toMatchObject({ code: 'not-configured' });
  });
});
