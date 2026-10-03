import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const routes = [
  '/',
  '/?tab=layers',
  '/?tab=approvals',
  '/approvals',
  '/briefing',
  '/log',
  '/settings',
  '/onboarding',
  '/pair',
  '/more',
];

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility (${theme})`, () => {
    for (const path of routes) {
      test(`no WCAG A/AA violations on ${path}`, async ({ app, request }) => {
        // Reduced motion also freezes the pulsing status dots, so axe never samples a half-faded colour.
        await app.emulateMedia({ reducedMotion: 'reduce' });
        await app.addInitScript((t) => localStorage.setItem('cc.theme', t), theme);
        await request.post('http://localhost:8787/__mock/approval'); // so Approvals has content
        await app.goto(path);
        await app.waitForTimeout(1500); // let live data settle
        const results = await new AxeBuilder({ page: app })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const summary = results.violations.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        );
        expect(summary).toEqual([]);
      });
    }
  });
}
