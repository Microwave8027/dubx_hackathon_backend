import { emitTo, listen } from '@tauri-apps/api/event';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { z } from 'zod';
import { WIDGET_SIZES, anchorRect, effectiveMargin } from '@/widget/geometry';
import {
  OpenPayloadSchema,
  VisibilityPayloadSchema,
  WIDGET_MAIN_VISIBILITY_EVENT,
  WIDGET_OPEN_EVENT,
  WIDGET_REQUEST_VISIBILITY_EVENT,
  WIDGET_SETTINGS_EVENT,
  targetPath,
} from '@/widget/messages';
import { invokeCommand } from './invoke';
import { emitPlatformEvent } from './events';
import type { Platform, WidgetSupport } from './types';

type WidgetMethods = Pick<
  Platform,
  | 'widgetSupport'
  | 'showWidget'
  | 'hideWidget'
  | 'setWidgetExpanded'
  | 'openCommandCenter'
  | 'watchMainWindow'
  | 'publishWidgetSettings'
  | 'watchWidgetSettings'
>;

const SupportSchema = z.object({ supported: z.boolean(), reason: z.string().optional() });

let expanded = false;
let bottomMargin = 0;

/** Moves and sizes the widget window to the bottom-right of the primary monitor's work area. */
export async function placeWidget(): Promise<void> {
  const monitor = await primaryMonitor();
  if (!monitor) return;
  const rect = anchorRect(
    monitor,
    expanded ? WIDGET_SIZES.expanded : WIDGET_SIZES.collapsed,
    effectiveMargin(monitor, bottomMargin),
  );
  const win = getCurrentWindow();
  // Grow toward the anchor first and shrink last so the window never hangs off the screen edge.
  if (expanded) {
    await win.setPosition(new PhysicalPosition(rect.x, rect.y));
    await win.setSize(new PhysicalSize(rect.width, rect.height));
  } else {
    await win.setSize(new PhysicalSize(rect.width, rect.height));
    await win.setPosition(new PhysicalPosition(rect.x, rect.y));
  }
}

/** Widget-window side. Only the widget webview should call these. */
export function createWidgetWindowMethods(): WidgetMethods {
  return {
    async widgetSupport(): Promise<WidgetSupport> {
      const parsed = SupportSchema.safeParse(await invokeCommand('widget_support'));
      return parsed.success ? parsed.data : { supported: true };
    },
    async showWidget(margin) {
      if (margin !== undefined) bottomMargin = margin;
      await placeWidget();
      // The window is created non-focusable, so showing it never takes focus from another app.
      await getCurrentWindow().show();
    },
    async hideWidget() {
      expanded = false; // it always comes back at its resting size
      await getCurrentWindow().hide();
    },
    async setWidgetExpanded(next, margin) {
      expanded = next;
      if (margin !== undefined) bottomMargin = margin;
      await placeWidget();
    },
    async openCommandCenter(target) {
      // The main window shows and focuses itself first (it may be hidden), then routes.
      await emitTo('main', WIDGET_OPEN_EVENT, { path: targetPath(target) });
    },
    async watchMainWindow(handler) {
      const unlisten = await listen(WIDGET_MAIN_VISIBILITY_EVENT, (e) => {
        const parsed = VisibilityPayloadSchema.safeParse(e.payload);
        if (parsed.success) handler(parsed.data.visible);
      });
      await emitTo('main', WIDGET_REQUEST_VISIBILITY_EVENT);
      return unlisten;
    },
    async publishWidgetSettings(settings) {
      await emitTo('widget', WIDGET_SETTINGS_EVENT, settings);
    },
    async watchWidgetSettings(handler) {
      return listen(WIDGET_SETTINGS_EVENT, (e) => handler(e.payload));
    },
  };
}

const DEBOUNCE_MS = 150;

/**
 * Main-window side: tells the widget whether the window is visible and follows "open" commands.
 * Tauri has no hidden/shown window event, so callers also call `broadcast` after show and hide.
 */
export function installMainWindowBridge(showWindow: () => Promise<void>): { broadcast(): void } {
  const win = getCurrentWindow();
  let last: boolean | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function send(force: boolean) {
    const visible = (await win.isVisible()) && !(await win.isMinimized());
    if (!force && visible === last) return;
    last = visible;
    await emitTo('widget', WIDGET_MAIN_VISIBILITY_EVENT, { visible });
  }
  const broadcast = () => {
    void send(false).catch(() => {});
  };
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(broadcast, DEBOUNCE_MS);
  };

  void win.onFocusChanged(debounced);
  void win.onResized(debounced);
  void listen(WIDGET_REQUEST_VISIBILITY_EVENT, () => void send(true).catch(() => {}));
  void listen(WIDGET_OPEN_EVENT, (e) => {
    const parsed = OpenPayloadSchema.safeParse(e.payload);
    if (!parsed.success) return;
    void showWindow()
      .then(() => {
        broadcast();
        emitPlatformEvent({ type: 'deep-link', path: parsed.data.path });
      })
      .catch(() => {});
  });
  return { broadcast };
}

/** Main-window stand-ins: the widget methods only mean something inside the widget webview. */
export function createMainWindowWidgetMethods(): WidgetMethods {
  const widget = createWidgetWindowMethods();
  return {
    widgetSupport: widget.widgetSupport,
    openCommandCenter: widget.openCommandCenter,
    publishWidgetSettings: widget.publishWidgetSettings,
    watchWidgetSettings: widget.watchWidgetSettings,
    async showWidget() {},
    async hideWidget() {},
    async setWidgetExpanded() {},
    async watchMainWindow() {
      return () => {};
    },
  };
}
