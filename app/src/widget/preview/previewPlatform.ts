import type { Platform, WidgetTarget } from '@/platform';

export interface PreviewHooks {
  onNativeExpanded(expanded: boolean): void;
  onOpen(target: WidgetTarget | undefined): void;
}

/**
 * A stand-in for the desktop platform adapter. "Resizing the native window" resizes a frame on the
 * page, and clicks are recorded instead of opening anything, so Playwright can assert on them.
 */
export function createPreviewPlatform(hooks: PreviewHooks): Platform {
  return {
    kind: 'browser',
    isDesktop: () => true,
    notify: async () => {},
    setTrayState: async () => {},
    showWindow: async () => {},
    openExternal: async () => {},
    widgetSupport: async () => ({ supported: true }),
    showWidget: async () => {},
    hideWidget: async () => {},
    setWidgetExpanded: async (expanded) => hooks.onNativeExpanded(expanded),
    openCommandCenter: async (target) => hooks.onOpen(target),
    watchMainWindow: async () => () => {},
    publishWidgetSettings: async () => {},
    watchWidgetSettings: async () => () => {},
  };
}
