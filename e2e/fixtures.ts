import { expect, test as base, type Page } from '@playwright/test';

const MOCK = 'http://localhost:8787';

interface Fixtures {
  /** A page with onboarding skipped, a freshly seeded mock, and a console-error tripwire. */
  app: Page;
}

export const test = base.extend<Fixtures>({
  app: async ({ page, request }, provide) => {
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
    expect(problems, 'no console errors or warnings').toEqual([]);
  },
});

export { expect };
