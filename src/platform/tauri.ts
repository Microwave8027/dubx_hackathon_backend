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
import type { NotifyOptions, Platform, TrayState } from './types';

const TRAY_ID = 'command-center';
const iconUrls: Record<TrayState, string> = {
  idle: idleIcon,
  working: workingIcon,
  'needs-you': needsYouIcon,
};

async function loadIcon(state: TrayState): Promise<Uint8Array> {
  const res = await fetch(iconUrls[state]);
  return new Uint8Array(await res.arrayBuffer());
}

async function showWindow(): Promise<void> {
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

let tray: TrayIcon | null = null;
let trayPending: Promise<TrayIcon> | null = null;

function getTray(initial: TrayState): Promise<TrayIcon> {
  if (tray) return Promise.resolve(tray);
  trayPending ??= (async () => {
    const created = await TrayIcon.new({
      id: TRAY_ID,
      icon: await loadIcon(initial),
      tooltip: 'Command Center',
      showMenuOnLeftClick: false,
      action: (event) => {
        if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
          void showWindow();
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
  });
}

export function createTauriPlatform(): Platform {
  installCloseToTray();
  return {
    kind: 'tauri',
    isDesktop: () => true,
    async notify({ title, body }: NotifyOptions) {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === 'granted';
      if (!granted) return;
      sendNotification({ title, body });
    },
    async setTrayState(state: TrayState) {
      const t = await getTray(state);
      await t.setIcon(await loadIcon(state));
    },
    showWindow,
  };
}
