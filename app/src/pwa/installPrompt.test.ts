import { vi } from 'vitest';
import {
  canPromptInstall,
  isIos,
  promptInstall,
  resetInstallPromptForTests,
} from './installPrompt';

function fireBeforeInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event as Event & { prompt: ReturnType<typeof vi.fn> };
}

beforeEach(() => resetInstallPromptForTests());

describe('install prompt', () => {
  it('captures beforeinstallprompt and prevents the default mini-infobar', () => {
    expect(canPromptInstall()).toBe(false);
    const e = fireBeforeInstall();
    expect(e.defaultPrevented).toBe(true);
    expect(canPromptInstall()).toBe(true);
  });

  it('prompts once, then the event is spent', async () => {
    const e = fireBeforeInstall('dismissed');
    expect(await promptInstall()).toBe('dismissed');
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(canPromptInstall()).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('clears after appinstalled', () => {
    fireBeforeInstall();
    window.dispatchEvent(new Event('appinstalled'));
    expect(canPromptInstall()).toBe(false);
  });
});

describe('isIos', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ua = (userAgent: string, maxTouchPoints = 0) =>
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints });

  it('detects iPhone and iPadOS-as-Mac', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIos()).toBe(true);
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
    expect(isIos()).toBe(true);
  });

  it('does not flag desktop Macs or Android', () => {
    ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
    expect(isIos()).toBe(false);
    ua('Mozilla/5.0 (Linux; Android 14)', 5);
    expect(isIos()).toBe(false);
  });
});
