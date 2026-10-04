import { vi } from 'vitest';
import { EXTENSION_ID } from './constants';
import { isExtensionInstalled, notifyExtensionConfigSaved } from './bridge';

type Send = (id: string, msg: unknown, cb: (r?: unknown) => void) => void;

function installChrome(send: Send, lastError?: { message: string }) {
  (globalThis as Record<string, unknown>).chrome = { runtime: { sendMessage: send, lastError } };
}
afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
  vi.useRealTimers();
});

describe('extension bridge', () => {
  it('does nothing where there is no chrome.runtime (other browsers, the desktop app)', async () => {
    await expect(notifyExtensionConfigSaved()).resolves.toBe(false);
    await expect(isExtensionInstalled()).resolves.toBe(false);
  });

  it('asks the extension to check now, addressed by its id', async () => {
    const send = vi.fn<Send>((_id, _msg, cb) => cb({ ok: true }));
    installChrome(send);
    await expect(notifyExtensionConfigSaved()).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(EXTENSION_ID, { type: 'check-now' }, expect.any(Function));
  });

  it('detects the extension with a ping that does not trigger a capture', async () => {
    const send = vi.fn<Send>((_id, _msg, cb) => cb({ ok: true, version: '0.1.0' }));
    installChrome(send);
    await expect(isExtensionInstalled()).resolves.toBe(true);
    expect(send.mock.calls[0]?.[1]).toEqual({ type: 'ping' });
  });

  it('reports not installed when Chrome says the extension is missing', async () => {
    installChrome((_id, _msg, cb) => cb(undefined), { message: 'Could not establish connection.' });
    await expect(isExtensionInstalled()).resolves.toBe(false);
    await expect(notifyExtensionConfigSaved()).resolves.toBe(false);
  });

  it('never throws, even if sendMessage does', async () => {
    installChrome(() => {
      throw new Error('boom');
    });
    await expect(notifyExtensionConfigSaved()).resolves.toBe(false);
  });

  it('gives up after a few seconds if the extension never answers', async () => {
    vi.useFakeTimers();
    installChrome(() => {});
    const result = isExtensionInstalled();
    await vi.advanceTimersByTimeAsync(3100);
    await expect(result).resolves.toBe(false);
  });
});
