// Usage: node scripts/screenshots.mjs <prefix> [path ...]
// Needs `pnpm dev:mock` running. Captures desktop and phone shots and reports console errors/warnings.
import { chromium } from '@playwright/test';

const [prefix, ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ['/'];
const base = process.env.APP_URL ?? 'http://localhost:1420';
const views = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    // IOS=1 emulates iPhone Safari so the iOS-only Add to Home Screen card shows.
    ...(process.env.IOS
      ? {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        }
      : {}),
  },
};

const browser = await chromium.launch();
let problems = 0;
for (const [name, opts] of Object.entries(views)) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) {
      problems++;
      console.log(`[${name}] console ${m.type()}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => {
    problems++;
    console.log(`[${name}] pageerror: ${e.message}`);
  });
  for (const [i, path] of targets.entries()) {
    await page.goto(base + path);
    await page.waitForTimeout(2500);
    // CLICK="Button name" presses a button first (e.g. to reveal the pairing QR code).
    if (process.env.CLICK) {
      await page.getByRole('button', { name: process.env.CLICK }).click();
      await page.waitForTimeout(800);
    }
    const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    await page.screenshot({
      path: `docs/screenshots/${prefix}-${name}-${slug}.png`,
      fullPage: Boolean(process.env.FULL), // FULL=1 captures the whole page
    });
    void i;
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `${problems} console problem(s)` : 'no console errors or warnings');
process.exit(problems ? 1 : 0);
