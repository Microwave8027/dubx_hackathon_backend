import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// The mock links instantly (the real backend returns a Google consent URL to open), and starts
// unlinked, so every test begins at "Connect Google Calendar".

test.describe('google calendar', () => {
  test('the menu has a Calendar tab that opens the page', async ({ app }) => {
    await app.goto('/');
    await app.getByRole('button', { name: 'Open menu' }).click();
    await app.getByRole('link', { name: 'Calendar' }).click();
    await expect(app).toHaveURL(/\/calendar$/);
    await expect(app.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
    await expect(app).toHaveTitle(/Calendar/);
  });

  test('connect, see events, switch views, disconnect', async ({ app }) => {
    await app.goto('/calendar');
    await expect(app.getByRole('radiogroup', { name: 'Calendar view' })).toHaveCount(0);
    await app.getByRole('button', { name: 'Connect Google Calendar' }).click();

    // Linked: the account shows and the mock schedule appears in the week.
    await expect(app.getByText(/demo@example.com/)).toBeVisible();
    await expect(app.getByRole('radiogroup', { name: 'Calendar view' })).toBeVisible();
    await expect(app.getByRole('article', { name: 'Math homework' }).first()).toBeVisible();
    await expect(app.locator('[data-today="true"]')).toHaveCount(1);

    // Agenda lists the same events by day.
    await app.getByRole('radio', { name: 'agenda' }).click();
    await expect(app.getByRole('list', { name: 'Agenda' })).toBeVisible();
    await expect(
      app
        .getByRole('list', { name: 'Agenda' })
        .getByRole('article', { name: 'Math homework' })
        .first(),
    ).toBeVisible();

    // Week navigation.
    await app.getByRole('radio', { name: 'week' }).click();
    const range = app.getByText(/–.*\d{4}$/);
    const before = await range.textContent();
    await app.getByRole('button', { name: 'Next week' }).click();
    await expect(range).not.toHaveText(before ?? '');
    await app.getByRole('button', { name: 'Today' }).click();
    await expect(range).toHaveText(before ?? '');

    // Disconnect asks first, then returns to the connect card.
    await app.getByRole('button', { name: 'Disconnect' }).click();
    const dialog = app.getByRole('dialog', { name: /disconnect google calendar/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Disconnect' }).click();
    await expect(app.getByRole('button', { name: 'Connect Google Calendar' })).toBeVisible();
  });

  test('with an agent that has no link or schedule endpoints, Connect is still offered', async ({
    app,
    allowConsole,
  }) => {
    // Expected failures: every calendar request 404s, so the browser logs them.
    allowConsole.push(/404|Failed to load resource|CORS/i);
    await app.route(/localhost:8787\/(integrations|schedule)/, (r) =>
      r.fulfill({
        status: 404,
        headers: {
          'access-control-allow-origin': 'http://localhost:1420',
          'access-control-allow-credentials': 'true',
        },
        body: '{}',
      }),
    );
    await app.goto('/calendar');
    await expect(app.getByRole('button', { name: 'Connect Google Calendar' })).toBeVisible();
    await app.getByRole('button', { name: 'Connect Google Calendar' }).click();
    await expect(app.getByRole('alert')).toContainText(/cannot link Google Calendar yet/i);
  });

  for (const state of ['not connected', 'connected'] as const) {
    test(`no accessibility violations (${state})`, async ({ app }) => {
      await app.emulateMedia({ reducedMotion: 'reduce' });
      await app.goto('/calendar');
      if (state === 'connected') {
        await app.getByRole('button', { name: 'Connect Google Calendar' }).click();
        await expect(app.getByRole('article', { name: 'Math homework' }).first()).toBeVisible();
      }
      const results = await new AxeBuilder({ page: app })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});
