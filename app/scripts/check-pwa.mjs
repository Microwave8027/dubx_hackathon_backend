// Verifies the production build behaves as a PWA. Needs `vite preview` on :4173 and the mock on :8787.
import { chromium } from '@playwright/test';

const base = process.env.APP_URL ?? 'http://localhost:4173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const problems = [];
page.on(
  'console',
  (m) =>
    ['error', 'warning'].includes(m.type()) && problems.push(`console ${m.type()}: ${m.text()}`),
);
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
const apiHits = [];
page.on('request', (r) => r.url().includes(':8787') && apiHits.push(r.url()));

await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
await page.evaluate(() => navigator.serviceWorker.ready);
const info = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const names = await caches.keys();
  const cached = [];
  for (const n of names)
    for (const r of await (await caches.open(n)).keys()) cached.push(new URL(r.url).pathname);
  const link = document.querySelector('link[rel=manifest]')?.getAttribute('href');
  const manifest = link ? await (await fetch(link)).json() : null;
  return { scope: reg.scope, active: !!reg.active, cached, manifest };
});
console.log('SW active:', info.active, 'scope:', info.scope);
console.log(
  'manifest:',
  info.manifest?.name,
  info.manifest?.display,
  info.manifest?.icons?.map((i) => `${i.sizes}/${i.purpose}`).join(', '),
);
console.log(
  'precached:',
  info.cached.length,
  'entries; includes index.html:',
  info.cached.some((p) => p.endsWith('index.html') || p === '/'),
);
console.log(
  'API urls in cache:',
  info.cached.filter((p) => /^\/(tasks|layers|approvals|log|profile|events)/.test(p)).length,
);

// Offline reload: the shell must load from the service worker cache.
await page.reload();
await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#root *', { timeout: 5000 });
const offlineText = await page.locator('body').innerText();
console.log(
  'offline shell renders:',
  offlineText.length > 0,
  '| offline banner:',
  /offline/i.test(offlineText),
);
await page.screenshot({ path: 'docs/screenshots/pr6-mobile-offline.png' });
await browser.close();
const ignorable = (p) => /WebSocket|Failed to load resource|net::ERR/i.test(p); // expected while offline
const real = problems.filter((p) => !ignorable(p));
console.log(real.length ? `problems:\n${real.join('\n')}` : 'no unexpected console errors');
process.exit(real.length ? 1 : 0);
