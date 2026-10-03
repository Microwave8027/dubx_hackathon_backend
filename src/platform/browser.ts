import { emitPlatformEvent } from './events';
import type { NotifyOptions, Platform } from './types';

export function createBrowserPlatform(): Platform {
  return {
    kind: 'browser',
    isDesktop: () => false,
    async notify({ title, body, deepLink }: NotifyOptions) {
      if (typeof Notification === 'undefined') return;
      let permission = Notification.permission;
      // Browsers may refuse a prompt that is not tied to a user gesture; that just means no notification.
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const n = new Notification(title, { body });
      n.onclick = () => {
        window.focus();
        if (deepLink) emitPlatformEvent({ type: 'deep-link', path: deepLink });
        n.close();
      };
    },
    // No tray in a browser.
    async setTrayState() {},
    async showWindow() {
      window.focus();
    },
  };
}
