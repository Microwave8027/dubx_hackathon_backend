import { expect, test as base, type Page } from '@playwright/test';

const MOCK = 'http://localhost:8787';

interface Fixtures {
  /** A page with onboarding skipped, a freshly seeded mock, and a console-error tripwire. */
  app: Page;
  /** Console messages matching these are expected by the test and do not trip the wire. */
  allowConsole: RegExp[];
}

export const test = base.extend<Fixtures>({
  // Playwright requires the destructuring pattern even when a fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  allowConsole: async ({}, provide) => {
    await provide([]);
  },
  app: async ({ page, request, allowConsole }, provide) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

    await request.post(`${MOCK}/__mock/reset`);
    await page.addInitScript(() => {
      localStorage.setItem('cc.onboarded', '1');
    });
    await provide(page);
    const unexpected = problems.filter((p) => !allowConsole.some((re) => re.test(p)));
    expect(unexpected, 'no console errors or warnings').toEqual([]);
  },
});

export { expect };
