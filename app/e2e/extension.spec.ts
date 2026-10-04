import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  type APIRequestContext,
  type BrowserContext,
  type Worker,
} from '@playwright/test';
import { expect, test } from './fixtures';

// Loads the real built extension into Chromium and drives it against the mock API and the real app.

const MOCK = 'http://localhost:8787';
const APP = 'http://localhost:1420';
const DIST = resolve('extension/dist');

interface Snapshot {
  requestId: string;
  deviceName: string;
  tabs: { url: string }[];
}

test.beforeAll(() => {
  execFileSync('node', ['extension/build.mjs'], { stdio: 'ignore' });
});

async function launch(): Promise<{ ctx: BrowserContext; sw: Worker; cleanup(): Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'cc-ext-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', // the new headless mode, which supports extensions
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  // On first install the extension opens its options page (the consent note). Let that finish so it
  // cannot collide with the test's own navigations.
  await expect
    .poll(() => ctx.pages().some((p) => p.url().startsWith('chrome-extension://')), {
      timeout: 10_000,
    })
    .toBe(true);
  return {
    ctx,
    sw,
    cleanup: async () => {
      await ctx.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function setup(request: APIRequestContext) {
  await request.post(`${MOCK}/__mock/reset`);
  const res = await request.post(`${MOCK}/api/extension/tokens`);
  const { token, id } = (await res.json()) as { token: string; id: string };
  return { token, tokenId: id };
}

const configure = (sw: Worker, settings: { token: string; consented: boolean }) =>
  sw.evaluate(
    async ({ token, consented, apiBase }) => {
      await chrome.storage.local.set({
        consented,
        settings: { apiBase, token, deviceName: 'Test Chrome' },
      });
    },
    { ...settings, apiBase: MOCK },
  );

const setDeviceName = (sw: Worker, name: string) =>
  sw.evaluate(async (deviceName) => {
    const stored = (await chrome.storage.local.get('settings')) as {
      settings: Record<string, unknown>;
    };
    await chrome.storage.local.set({ settings: { ...stored.settings, deviceName } });
  }, name);

const snapshots = async (request: APIRequestContext): Promise<Snapshot[]> =>
  (await request.get(`${MOCK}/__mock/extension/snapshots`)).json();

/** Fires the same code path as the 30-second alarm, without waiting 30 seconds. */
const firePoll = (sw: Worker) =>
  sw.evaluate(() => chrome.alarms.create('poll', { when: Date.now() + 100 }));

const status = (sw: Worker) =>
  sw.evaluate(async () => {
    const { status } = await chrome.storage.local.get('status');
    // Nothing is stored until the first pass has run; return a placeholder so polling can retry.
    return (status ?? { kind: 'none', message: '' }) as { kind: string; message: string };
  });

test.describe('chrome extension (real Chromium, real extension)', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, in desktop Chromium');

  test('save in the app captures instantly; another request is picked up by polling; retries are idempotent', async ({
    request,
  }) => {
    const { token } = await setup(request);
    const { ctx, sw, cleanup } = await launch();
    try {
      // The stable id from the manifest key is what the app and the server expect.
      expect(new URL(sw.url()).host).toBe('dkalbkpfkomiienoddgbkngihfhbjinp');
      await configure(sw, { token, consented: true });

      // Some tabs: two real app pages, plus pages that must never be captured.
      const app = await ctx.newPage();
      await app.addInitScript(() => localStorage.setItem('cc.onboarded', '1'));
      await app.goto(`${APP}/settings`);
      await (await ctx.newPage()).goto(`${APP}/log`);
      await (await ctx.newPage()).goto('chrome://version');
      await (await ctx.newPage()).goto('about:blank');

      // 1. Instant path: the real Save button, which creates a sync request on the server and
      //    messages the extension from the page.
      const briefing = app.getByLabel(/briefing time/i);
      await briefing.fill('06:45');
      await app.getByRole('button', { name: 'Save changes' }).click();
      await expect.poll(async () => (await snapshots(request)).length, { timeout: 5000 }).toBe(1);

      const first = (await snapshots(request))[0]!;
      expect(first.deviceName).toBe('Test Chrome');
      const urls = first.tabs.map((t) => t.url);
      expect(urls).toContain(`${APP}/settings`);
      expect(urls).toContain(`${APP}/log`);
      expect(urls.every((u) => /^https?:\/\//.test(u))).toBe(true); // no chrome://, about:, extension pages

      // 2. Polling path: a second request, answered when the alarm fires (as on another browser).
      await request.post(`${MOCK}/__mock/extension/sync-request`);
      await firePoll(sw);
      await expect.poll(async () => (await snapshots(request)).length, { timeout: 5000 }).toBe(2);

      // 3. Nothing new is pending, so another poll posts nothing (no duplicates).
      await firePoll(sw);
      await expect
        .poll(async () => (await status(sw)).message, { timeout: 5000 })
        .toBe('Up to date.');
      expect(await snapshots(request)).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  test('two profiles: the one that saves captures instantly, the other catches up by polling', async ({
    request,
  }) => {
    const { token } = await setup(request);
    const a = await launch();
    const b = await launch();
    try {
      for (const x of [a, b]) await configure(x.sw, { token, consented: true });
      await setDeviceName(a.sw, 'Profile A');
      await setDeviceName(b.sw, 'Profile B');

      // Different tabs open in each profile.
      const pageA = await a.ctx.newPage();
      await pageA.addInitScript(() => localStorage.setItem('cc.onboarded', '1'));
      await pageA.goto(`${APP}/settings`);
      await (await b.ctx.newPage()).goto(`${APP}/briefing`);

      // Save in profile A only.
      await pageA.getByLabel(/briefing time/i).fill('07:10');
      await pageA.getByRole('button', { name: 'Save changes' }).click();
      await expect.poll(async () => (await snapshots(request)).length, { timeout: 5000 }).toBe(1);
      expect((await snapshots(request))[0]?.deviceName).toBe('Profile A');

      // Profile B has not been told by the page; its next poll finds the request.
      await firePoll(b.sw);
      await expect.poll(async () => (await snapshots(request)).length, { timeout: 5000 }).toBe(2);
      const all = await snapshots(request);
      const byName = Object.fromEntries(all.map((s) => [s.deviceName, s]));
      expect(byName['Profile A']?.tabs.map((t) => t.url)).toContain(`${APP}/settings`);
      expect(byName['Profile B']?.tabs.map((t) => t.url)).toContain(`${APP}/briefing`);
      expect(byName['Profile A']?.requestId).toBe(byName['Profile B']?.requestId); // same save
      expect((byName['Profile A'] as unknown as { deviceId: string }).deviceId).not.toBe(
        (byName['Profile B'] as unknown as { deviceId: string }).deviceId,
      );

      // A's alarm must not post a second snapshot for the same save.
      await firePoll(a.sw);
      await expect
        .poll(async () => (await status(a.sw)).message, { timeout: 5000 })
        .toBe('Up to date.');
      expect(await snapshots(request)).toHaveLength(2);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });

  test('sends nothing until the user has accepted the consent note', async ({ request }) => {
    const { token } = await setup(request);
    const { sw, cleanup } = await launch();
    try {
      await configure(sw, { token, consented: false });
      await request.post(`${MOCK}/__mock/extension/sync-request`);
      await firePoll(sw);
      await expect
        .poll(async () => (await status(sw)).message, { timeout: 5000 })
        .toMatch(/consent/i);
      expect(await snapshots(request)).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  test('stops syncing, with a clear message, once the token is revoked', async ({ request }) => {
    const { token, tokenId } = await setup(request);
    const { sw, cleanup } = await launch();
    try {
      await configure(sw, { token, consented: true });
      await request.delete(`${MOCK}/api/extension/tokens/${tokenId}`);
      await request.post(`${MOCK}/__mock/extension/sync-request`);
      await firePoll(sw);
      await expect.poll(async () => (await status(sw)).kind, { timeout: 5000 }).toBe('error');
      expect((await status(sw)).message).toMatch(/token was rejected/i);
      expect(await snapshots(request)).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});
