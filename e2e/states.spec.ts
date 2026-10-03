import { expect, test } from './fixtures';

test.describe('states and modes', () => {
  test('?demo=1 seeds the three demo tasks and clears the flag', async ({ app }) => {
    await app.goto('/?demo=1');
    await expect(app).toHaveURL(/\/$/);
    const list = app.getByRole('list', { name: 'Tasks' });
    await expect(list.getByText('Research a topic and write a summary file')).toBeVisible();
    await expect(list.getByText('Organize a test Downloads folder')).toBeVisible();
    await expect(list.getByText('Draft an email to the team about Friday')).toBeVisible();
  });

  test('shows a reconnecting/offline banner and recovers', async ({ app, context }) => {
    await app.goto('/');
    await expect(app.getByRole('list', { name: 'Tasks' })).toBeVisible();
    await context.setOffline(true);
    const banner = app.getByRole('status').filter({ hasText: 'You are offline' });
    await expect(banner).toBeVisible();
    // Panels that already loaded keep their content instead of turning into errors.
    await expect(app.getByRole('alert')).toHaveCount(0);
    await context.setOffline(false);
    await expect(banner).toBeHidden();
  });

  test('onboarding appears on first run and can be skipped', async ({ page, request }) => {
    await request.post('http://localhost:8787/__mock/reset');
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page).toHaveURL(/\/$/); // and it does not come back
  });

  test('permission tiers: payments and deletes are locked, send_message asks', async ({ app }) => {
    await app.goto('/settings');
    await expect(app.getByRole('heading', { name: 'Settings' })).toBeVisible();
    for (const name of ['Make a payment permission', 'Delete files permission']) {
      const group = app.getByRole('radiogroup', { name });
      await expect(group.getByRole('radio', { name: 'Never' })).toBeChecked();
      for (const radio of await group.getByRole('radio').all()) await expect(radio).toBeDisabled();
    }
    await expect(
      app
        .getByRole('radiogroup', { name: 'Send a message permission' })
        .getByRole('radio', { name: 'Ask me' }),
    ).toBeChecked();
  });

  test('touch targets are at least 44px on the main screens (phone)', async ({ app }, info) => {
    test.skip(info.project.name !== 'phone', 'touch target size is a phone concern');
    for (const path of ['/', '/?tab=layers', '/approvals', '/log', '/settings', '/more']) {
      await app.goto(path);
      await app.waitForTimeout(800);
      const small = await app.evaluate(() => {
        const sel =
          'button, a[href], input:not([type=radio]):not([type=checkbox]), select, summary, [role=radio]';
        return (
          [...document.querySelectorAll<HTMLElement>(sel)]
            .filter((el) => el.offsetParent !== null && !el.closest('.sr-only'))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
            .filter(
              ({ el, r }) => (r.height < 43.5 || r.width < 43.5) && !el.closest('p, li > span, td'),
            )
            .map(
              ({ el, r }) =>
                `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
            )
        );
      });
      expect(small, `small targets on ${path}`).toEqual([]);
    }
  });
});
