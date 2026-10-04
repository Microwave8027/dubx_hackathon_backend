import { ApiError, createApi, normalizeApiBase } from './api';
import { formatWhen } from './format';
import { load, save } from './storage';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const consent = $<HTMLInputElement>('consent');
const api = $<HTMLInputElement>('api');
const token = $<HTMLInputElement>('token');
const device = $<HTMLInputElement>('device');
const msg = $('msg');
const statusEl = $('status');

function say(text: string, tone: 'ok' | 'err' | 'muted' = 'muted'): void {
  msg.textContent = text;
  msg.className = tone;
}

function readBase(): string | null {
  try {
    return normalizeApiBase(api.value);
  } catch (e) {
    say(e instanceof Error ? e.message : 'Check the URL.', 'err');
    return null;
  }
}

async function render(): Promise<void> {
  const s = await load();
  consent.checked = s.consented;
  api.value = s.settings.apiBase;
  token.value = s.settings.token;
  device.value = s.settings.deviceName;
  $('device-id').textContent = s.deviceId ? `Device ID: ${s.deviceId}` : '';
  setEnabled(s.consented);
  renderStatus(s.status, s.lastSnapshotAt, s.queue.length);
}

function renderStatus(
  status: { kind: string; message: string; at: number } | null,
  lastSnapshotAt: number | null,
  queued: number,
): void {
  if (!status) {
    statusEl.textContent = 'No sync yet.';
    statusEl.className = 'muted';
    return;
  }
  const last = lastSnapshotAt ? ` Last snapshot ${formatWhen(lastSnapshotAt)}.` : '';
  const queue = queued ? ` ${queued} waiting to retry.` : '';
  statusEl.textContent = `${status.message} (${formatWhen(status.at)}).${last}${queue}`;
  statusEl.className = status.kind === 'error' ? 'err' : status.kind === 'ok' ? 'ok' : 'muted';
}

function setEnabled(consented: boolean): void {
  for (const id of ['save', 'api', 'token', 'device']) {
    ($(id) as HTMLButtonElement | HTMLInputElement).disabled = !consented;
  }
  if (!consented) say('Accept the note above to turn on syncing.', 'muted');
}

consent.addEventListener('change', async () => {
  await save({ consented: consent.checked });
  setEnabled(consent.checked);
  if (consent.checked) say('');
});

$('save').addEventListener('click', async () => {
  const base = readBase();
  if (base === null) return;
  if (!token.value.trim()) return say('Paste the token from the app.', 'err');
  const prev = await load();
  await save({
    settings: {
      apiBase: base,
      token: token.value.trim(),
      deviceName: device.value.trim() || 'Chrome',
    },
  });
  api.value = base;
  say('Saved. This browser will sync on the next config save.', 'ok');
  // Try straight away so a wrong token shows up now, not 30 seconds later.
  if (prev.consented) void chrome.runtime.sendMessage({ type: 'sync-now' }).then(render, () => {});
});

$('test').addEventListener('click', async () => {
  const base = readBase();
  if (base === null) return;
  if (!token.value.trim()) return say('Paste the token first.', 'err');
  say('Testing…');
  try {
    const me = await createApi(base, token.value.trim()).me();
    say(`Connected as ${me.userId}.`, 'ok');
  } catch (e) {
    say(e instanceof ApiError || e instanceof Error ? e.message : 'Could not connect.', 'err');
  }
});

$('disconnect').addEventListener('click', async () => {
  const s = await load();
  await save({ settings: { ...s.settings, token: '' }, queue: [], status: null });
  token.value = '';
  say('Token removed. Nothing will be sent until you add a new one.', 'ok');
  await render();
});

chrome.storage.onChanged.addListener(() => void render());
void render();
