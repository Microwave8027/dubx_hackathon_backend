// pnpm design:export
// Starts `pnpm dev:mock` (unless the app is already running), applies the demo seeds, and
// captures every existing screen at 1440x900 and 390x844 into design-export/screens/.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { DEMO_SEEDS, SCREENS, VIEWPORTS, fileName } from './screens.mjs';

const APP = process.env.APP_URL ?? 'http://localhost:1420';
const MOCK = process.env.MOCK_URL ?? 'http://localhost:8787';
const OUT = 'design-export/screens';

const up = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
};

async function waitFor(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await up(url)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let server = null;
async function startServers() {
  if ((await up(APP)) && (await up(`${MOCK}/layers`))) {
    console.log('Using the app and mock that are already running.');
    return;
  }
  console.log('Starting pnpm dev:mock ...');
  server = spawn('pnpm', ['dev:mock'], {
    stdio: 'ignore',
    detached: true, // own process group so the whole tree can be stopped
    // Layers take ~12s to finish, so both viewports capture them mid-run; approvals are raised on demand.
    env: {
      ...process.env,
      MOCK_STEP_MS: '4000',
      MOCK_APPROVAL_MS: '600000',
      MOCK_CALENDAR_MS: '600000',
    },
  });
  await Promise.all([waitFor(`${MOCK}/layers`), waitFor(APP)]);
}

function stopServers() {
  if (server?.pid) {
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
  }
}

const post = (path) => fetch(`${MOCK}${path}`, { method: 'POST' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Puts the mock in the state a screen needs. Returns the running layer to show, if any. */
async function prepare(kind) {
  await post('/__mock/reset');
  if (kind === 'approvals') {
    await post('/__mock/approval');
    await post('/__mock/approval');
  }
  if (kind === 'settled')
    await sleep(15_000); // 3 ticks of 4s plus margin: layers finish, log fills, approval pending
  else await sleep(2500); // layers are mid-run with live previews
  const layers = await (await fetch(`${MOCK}/layers`)).json();
  return layers.find((l) => l.usesScreen) ?? layers[0];
}

async function capture(browser, screen, viewportName, layer, results) {
  const viewport = VIEWPORTS[viewportName];
  const phone = viewportName === 'phone';
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  if (!screen.firstRun) await ctx.addInitScript(() => localStorage.setItem('cc.onboarded', '1'));
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  try {
    await page.goto(APP + screen.route.replace(':layer', layer?.id ?? ''));
    await page.waitForTimeout(1500);
    if (screen.click) {
      await page.getByRole('button', { name: screen.click }).click();
      await page.waitForTimeout(800);
    }
    const file = `${OUT}/${fileName(screen, viewportName)}`;
    await page.screenshot({ path: file, fullPage: Boolean(screen.fullPage) });
    results.captured.push(file);
    if (problems.length) results.warnings.push(`${file}: ${problems.join(' | ')}`);
  } catch (err) {
    results.failed.push(`${screen.name} (${viewportName}): ${err.message.split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await startServers();

  const results = { captured: [], failed: [], warnings: [], pending: [] };
  const browser = await chromium.launch();
  try {
    // Demo seeds (the app consumes ?demo=... and tells the mock).
    const seeder = await browser.newPage();
    for (const seed of DEMO_SEEDS) {
      if (seed.pending) {
        results.pending.push(`demo seed ?demo=${seed.flag}`);
        continue;
      }
      await seeder.goto(`${APP}/?demo=${seed.flag}`);
      await seeder.waitForTimeout(800);
    }
    await seeder.close();

    for (const screen of SCREENS) {
      if (screen.pending) {
        results.pending.push(`${String(screen.n).padStart(2, '0')} ${screen.name}`);
        continue;
      }
      const layer = await prepare(screen.prepare);
      for (const viewportName of Object.keys(VIEWPORTS)) {
        await capture(browser, screen, viewportName, layer, results);
      }
    }
  } finally {
    await browser.close();
    stopServers();
  }

  console.log(`\nCaptured ${results.captured.length} images in ${OUT}/`);
  if (results.pending.length) {
    console.log(
      `Not built yet, skipped (${results.pending.length}):\n  ${results.pending.join('\n  ')}`,
    );
  }
  if (results.warnings.length) console.log(`Console warnings:\n  ${results.warnings.join('\n  ')}`);
  if (results.failed.length) {
    console.error(`Failed (${results.failed.length}):\n  ${results.failed.join('\n  ')}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  stopServers();
  process.exit(130);
});
main().catch((err) => {
  stopServers();
  console.error(err);
  process.exit(1);
});
