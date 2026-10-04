import { vi } from 'vitest';
import type { Platform } from '@/platform';

/** A desktop-like Platform where every method is a spy; override what a test cares about. */
export function createFakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    kind: 'tauri',
    isDesktop: () => true,
    notify: vi.fn().mockResolvedValue(undefined),
    setTrayState: vi.fn().mockResolvedValue(undefined),
    showWindow: vi.fn().mockResolvedValue(undefined),
    openExternal: vi.fn().mockResolvedValue(undefined),
    widgetSupport: vi.fn().mockResolvedValue({ supported: true }),
    showWidget: vi.fn().mockResolvedValue(undefined),
    hideWidget: vi.fn().mockResolvedValue(undefined),
    setWidgetExpanded: vi.fn().mockResolvedValue(undefined),
    openCommandCenter: vi.fn().mockResolvedValue(undefined),
    watchMainWindow: vi.fn().mockResolvedValue(() => {}),
    publishWidgetSettings: vi.fn().mockResolvedValue(undefined),
    watchWidgetSettings: vi.fn().mockResolvedValue(() => {}),
    ...overrides,
  };
}
