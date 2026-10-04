import { detectTauri, getPlatform, setPlatformForTests } from './index';

afterEach(() => {
  setPlatformForTests(null);
  delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
});

describe('platform adapter', () => {
  it('uses the browser implementation outside Tauri', () => {
    expect(detectTauri()).toBe(false);
    const p = getPlatform();
    expect(p.kind).toBe('browser');
    expect(p.isDesktop()).toBe(false);
  });

  it('browser tray is a no-op', async () => {
    await expect(getPlatform().setTrayState('needs-you')).resolves.toBeUndefined();
  });

  it('detects the Tauri runtime', () => {
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    expect(detectTauri()).toBe(true);
  });

  it('returns the same instance every time', () => {
    expect(getPlatform()).toBe(getPlatform());
  });
});
