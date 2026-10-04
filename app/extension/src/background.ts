import { createApi, ApiError } from './api';
import { createSyncRunner } from './sync';
import { ensureDeviceId, load, save } from './storage';
import { captureTabs } from './tabs';

declare const __APP_ORIGIN__: string;

const ALARM = 'poll';
/** Chrome's minimum alarm period is 30 seconds. */
const POLL_MINUTES = 0.5;

const sync = createSyncRunner({
  load,
  save,
  createApi: (base, token) => createApi(base, token),
  capture: captureTabs,
  now: () => Date.now(),
});

async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, {
      periodInMinutes: POLL_MINUTES,
      delayInMinutes: POLL_MINUTES,
    });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureDeviceId();
  const state = await load();
  if (!state.settings.deviceName) {
    const { os } = await chrome.runtime.getPlatformInfo();
    await save({ settings: { ...state.settings, deviceName: `Chrome on ${os}` } });
  }
  await ensureAlarm();
  // First run: the options page holds the consent note and the pairing fields.
  if (details.reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => void ensureAlarm());

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void sync();
});

/** The web app, on the browser where the config was saved, asks for an immediate capture. */
chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  const type = (message as { type?: unknown } | null)?.type;
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '');
  if (origin !== __APP_ORIGIN__) {
    sendResponse({ ok: false, error: 'origin_not_allowed' });
    return false;
  }
  // Lets the app show "extension detected" without triggering a capture.
  if (type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  if (type !== 'check-now') {
    sendResponse({ ok: false, error: 'unsupported' });
    return false;
  }
  sync().then(
    (r) => sendResponse({ ok: !r.failed, ...r }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

/** The popup and options page. Only this extension's own pages can send these. */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const type = (message as { type?: unknown } | null)?.type;
  if (type === 'sync-now') {
    sync().then(
      (r) => sendResponse({ ok: !r.failed, ...r }),
      (e) => sendResponse({ ok: false, failed: e instanceof ApiError ? e.message : 'Failed' }),
    );
    return true;
  }
  return false;
});
