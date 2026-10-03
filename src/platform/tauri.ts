import { Menu } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import idleIcon from '@/assets/tray/idle.png?url';
import workingIcon from '@/assets/tray/working.png?url';
import needsYouIcon from '@/assets/tray/needs-you.png?url';
import { emitPlatformEvent } from './events';
import {
  createMainWindowWidgetMethods,
  createWidgetWindowMethods,
  installMainWindowBridge,
} from './widget';
import type { NotifyOptions, Platform, TrayState } from './types';

const TRAY_ID = 'command-center';
const iconUrls: Record<TrayState, string> = {
  idle: idleIcon,
  working: workingIcon,
  'needs-you': needsYouIcon,
};
const tooltips: Record<TrayState, string> = {
  idle: 'Command Center: idle',
  working: 'Command Center: working',
  'needs-you': 'Command Center: needs you',
};

async function loadIcon(state: TrayState): Promise<Uint8Array> {
  const res = await fetch(iconUrls[state]);
  return new Uint8Array(await res.arrayBuffer());
}

let broadcastMainVisibility: () => void = () => {};

async function showWindow(): Promise<void> {
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
  broadcastMainVisibility();
}

let tray: TrayIcon | null = null;
let trayPending: Promise<TrayIcon> | null = null;

function getTray(initial: TrayState): Promise<TrayIcon> {
  if (tray) return Promise.resolve(tray);
  trayPending ??= (async () => {
    const menu = await Menu.new({
      items: [
        { id: 'open', text: 'Open', action: () => void showWindow() },
        {
          id: 'pause-all',
          text: 'Pause all layers',
          action: () => emitPlatformEvent({ type: 'pause-all' }),
        },
        // destroy() skips the close-to-tray handler, so this really quits.
        { id: 'quit', text: 'Quit', action: () => void getCurrentWindow().destroy() },
      ],
    });
    const created = await TrayIcon.new({
      id: TRAY_ID,
      icon: await loadIcon(initial),
      tooltip: tooltips[initial],
      menu,
      showMenuOnLeftClick: false, // left click opens the window; right click shows the menu
      action: (event) => {
        if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
          void showWindow();
          emitPlatformEvent({ type: 'tray-click' });
        }
      },
    });
    tray = created;
    return created;
  })();
  return trayPending;
}

let closeToTrayInstalled = false;
function installCloseToTray(): void {
  if (closeToTrayInstalled) return;
  closeToTrayInstalled = true;
  void getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();
    await getCurrentWindow().hide();
    broadcastMainVisibility();
  });
}

// The notification plugin has no click callback on desktop. Remember the last deep link and
// follow it if the window is focused shortly afterwards (which is what clicking a notification does).
const DEEP_LINK_WINDOW_MS = 30_000;
let pendingLink: { path: string; at: number } | null = null;
let focusWatchInstalled = false;
function installFocusWatch(): void {
  if (focusWatchInstalled) return;
  focusWatchInstalled = true;
  void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused || !pendingLink) return;
    const link = pendingLink;
    pendingLink = null;
    if (Date.now() - link.at <= DEEP_LINK_WINDOW_MS) {
      emitPlatformEvent({ type: 'deep-link', path: link.path });
    }
  });
}

let permission: 'unknown' | 'granted' | 'denied' = 'unknown';

async function ensurePermission(): Promise<boolean> {
  if (permission === 'denied') return false; // do not nag after a refusal
  if (permission === 'granted') return true;
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  permission = granted ? 'granted' : 'denied';
  return granted;
}

export function createTauriPlatform(): Platform {
  // The widget webview shares this adapter but must not get tray, close-to-tray or focus handling.
  const isMain = getCurrentWindow().label === 'main';
  if (isMain) {
    installCloseToTray();
    installFocusWatch();
    broadcastMainVisibility = installMainWindowBridge(showWindow).broadcast;
  }
  const widgetMethods = isMain ? createMainWindowWidgetMethods() : createWidgetWindowMethods();
  return {
    ...widgetMethods,
    kind: 'tauri',
    isDesktop: () => true,
    async notify({ title, body, deepLink }: NotifyOptions) {
      if (!(await ensurePermission())) return;
      if (deepLink) pendingLink = { path: deepLink, at: Date.now() };
      sendNotification({ title, body });
    },
    async setTrayState(state: TrayState) {
      const t = await getTray(state);
      await t.setIcon(await loadIcon(state));
      await t.setTooltip(tooltips[state]);
    },
    showWindow,
  };
}
