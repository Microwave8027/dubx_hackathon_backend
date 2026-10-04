import { expect, test } from './fixtures';

test.describe('Settings: Connect extension', () => {
  test('generate a token (shown once), see it listed, revoke it', async ({ app, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await app.goto('/settings');
    const section = app.getByRole('region', { name: 'Connect extension' });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText('No tokens yet.')).toBeVisible();
    await expect(section.getByText(/was not found in this browser/i)).toBeVisible();

    await section.getByRole('button', { name: 'Generate token' }).click();
    const field = section.getByLabel('Extension token');
    const token = await field.inputValue();
    expect(token).toMatch(/^cct_[\w-]{20,}$/);
    await expect(section.getByText(/shown once/i)).toBeVisible();

    await section.getByRole('button', { name: /i’ve saved it/i }).click();
    await expect(section.getByLabel('Extension token')).toHaveCount(0);
    await expect(app.locator('body')).not.toContainText(token);

    // The token is gone from the page and from every storage the page can reach.
    const leaked = await app.evaluate(
      (t) => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(t),
      token,
    );
    expect(leaked).toBe(false);

    const list = section.getByRole('list', { name: 'Tokens' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Last used never');

    await list.getByRole('button', { name: 'Revoke' }).click();
    const dialog = app.getByRole('dialog', { name: /revoke this token/i });
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect(section.getByText('No tokens yet.')).toBeVisible();
  });

  test('has no accessibility violations', async ({ app }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/settings');
    await app
      .getByRole('region', { name: 'Connect extension' })
      .getByRole('button', { name: 'Generate token' })
      .click();
    await expect(app.getByLabel('Extension token')).toBeVisible();
    const results = await new AxeBuilder({ page: app })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      ),
    ).toEqual([]);
  });
});
