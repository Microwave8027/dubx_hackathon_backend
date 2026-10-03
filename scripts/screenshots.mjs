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
    const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    await page.screenshot({ path: `docs/screenshots/${prefix}-${name}-${slug}.png` });
    void i;
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `${problems} console problem(s)` : 'no console errors or warnings');
process.exit(problems ? 1 : 0);
