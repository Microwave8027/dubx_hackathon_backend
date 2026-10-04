import { connectionOf, formatWhen } from './format';
import { load } from './storage';

const el = (id: string): HTMLElement => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e;
};
const syncBtn = el('sync') as HTMLButtonElement;

async function render(): Promise<void> {
  const s = await load();
  const conn = connectionOf(s);
  const state = el('state');
  state.textContent = conn === 'connected' ? 'Connected' : 'Not connected';
  state.className = conn === 'connected' ? 'ok' : 'err';
  el('detail').textContent =
    conn === 'needs-consent'
      ? 'Open Settings and accept the consent note.'
      : conn === 'needs-token'
        ? 'Open Settings and add the API URL and token.'
        : (s.status?.message ?? 'Waiting for a config save.');
  el('last').textContent = `Last snapshot: ${formatWhen(s.lastSnapshotAt)}`;
  syncBtn.disabled = conn !== 'connected';
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing…';
  try {
    await chrome.runtime.sendMessage({ type: 'sync-now' });
  } finally {
    syncBtn.textContent = 'Sync now';
    await render();
  }
});

el('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener(() => void render());
void render();
