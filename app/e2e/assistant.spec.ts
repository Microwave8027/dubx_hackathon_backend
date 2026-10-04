import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const MOCK = 'http://localhost:8787';
const expected4xx = /401|502|Failed to load resource/i; // the browser logs HTTP errors we provoke on purpose

async function ask(app: import('@playwright/test').Page, text: string) {
  await app.getByLabel('What should change?').fill(text);
  await app.getByRole('button', { name: 'Suggest changes' }).click();
}

test.describe('assistant', () => {
  test('the menu has an Assistant tab', async ({ app }) => {
    await app.goto('/');
    await app.getByRole('button', { name: 'Open menu' }).click();
    await app.getByRole('link', { name: 'Assistant' }).click();
    await expect(app).toHaveURL(/\/assistant$/);
    await expect(app.getByRole('heading', { name: 'Assistant', level: 1 })).toBeVisible();
    await expect(app).toHaveTitle(/Assistant/);
  });

  test('ask, review, apply: the calendar really changes', async ({ app, request }) => {
    await app.goto('/assistant');
    await ask(app, 'Add some focus time tomorrow');

    const list = app.getByRole('list', { name: 'Proposed changes' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Add');
    await expect(list).toContainText('Deep work');
    await expect(app.getByText(/focus block tomorrow/i)).toBeVisible();
    // Reviewing changes nothing yet.
    const before = (await (await request.get(`${MOCK}/schedule`)).json()) as {
      events: { title: string }[];
    };
    expect(before.events.some((e) => e.title === 'Deep work')).toBe(false);

    await app.getByRole('button', { name: 'Apply 1 change' }).click();
    await expect(app.getByText(/Applied 1 change/)).toBeVisible();
    await expect(list).toHaveCount(0);
    await expect(app.getByLabel('What should change?')).toHaveValue('');

    // It is on the calendar, in the UI.
    await app.goto('/calendar');
    await app.getByRole('button', { name: 'Connect Google Calendar' }).click();
    await app.getByRole('radio', { name: 'agenda' }).click();
    await expect(
      app.getByRole('list', { name: 'Agenda' }).getByRole('article', { name: 'Deep work' }),
    ).toBeVisible();
  });

  test('only the ticked changes are applied', async ({ app, request }) => {
    await app.goto('/assistant');
    await ask(app, 'Clear my afternoon');
    const list = app.getByRole('list', { name: 'Proposed changes' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toContainText('Remove');

    const events = async () =>
      ((await (await request.get(`${MOCK}/schedule`)).json()) as { events: { id: string }[] })
        .events.length;
    const total = await events();
    await app.getByRole('checkbox', { name: 'Apply change 2' }).uncheck();
    await app.getByRole('button', { name: 'Apply 1 change' }).click();
    await expect(app.getByText(/Applied 1 change/)).toBeVisible();
    expect(await events()).toBe(total - 1);
  });

  test('a partly failed apply says so and keeps the proposal', async ({ app }) => {
    await app.goto('/assistant');
    await ask(app, 'make some of these fail');
    await app.getByRole('button', { name: 'Apply 2 changes' }).click();
    await expect(app.getByText(/1 applied, 1 failed: Event not found/)).toBeVisible();
    await expect(app.getByRole('list', { name: 'Proposed changes' })).toBeVisible();
  });

  test('nothing to change, and discarding', async ({ app }) => {
    await app.goto('/assistant');
    await ask(app, 'make no changes please');
    await expect(app.getByText('No changes needed.')).toBeVisible();
    await ask(app, 'Add focus time');
    await expect(app.getByRole('list', { name: 'Proposed changes' })).toBeVisible();
    await app.getByRole('button', { name: 'Discard' }).click();
    await expect(app.getByRole('list', { name: 'Proposed changes' })).toHaveCount(0);
  });

  test('an AI failure shows the server’s message', async ({ app, allowConsole }) => {
    allowConsole.push(expected4xx);
    await app.goto('/assistant');
    await ask(app, 'please gemini-error');
    await expect(app.getByRole('alert')).toContainText('Gemini returned an invalid response');
  });

  test('not signed in: shows a Google sign-in link, then works after signing in', async ({
    app,
    request,
    allowConsole,
  }) => {
    allowConsole.push(expected4xx);
    await request.post(`${MOCK}/__mock/assistant?signedIn=false`);
    await app.goto('/assistant');
    await ask(app, 'Add focus time');
    const link = app.getByRole('link', { name: 'Sign in with Google' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/auth\/google$/);

    await request.post(`${MOCK}/__mock/assistant?signedIn=true`);
    await app.getByRole('button', { name: /i’ve signed in/i }).click();
    await expect(app.getByRole('list', { name: 'Proposed changes' })).toBeVisible();
    await expect(link).toHaveCount(0);
  });

  for (const state of ['proposal', 'sign-in'] as const) {
    test(`no accessibility violations (${state})`, async ({ app, request, allowConsole }) => {
      allowConsole.push(expected4xx);
      await app.emulateMedia({ reducedMotion: 'reduce' });
      if (state === 'sign-in') await request.post(`${MOCK}/__mock/assistant?signedIn=false`);
      await app.goto('/assistant');
      await ask(app, 'Add focus time and move my first meeting later');
      await expect(
        state === 'proposal'
          ? app.getByRole('list', { name: 'Proposed changes' })
          : app.getByRole('link', { name: 'Sign in with Google' }),
      ).toBeVisible();
      await app.waitForLoadState('networkidle');
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
