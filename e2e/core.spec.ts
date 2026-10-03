import { expect, test } from './fixtures';

test.describe('core flows', () => {
  test('add a task with Enter and watch it get a layer', async ({ app }) => {
    await app.goto('/');
    const box = app.getByLabel('What should the agent do?');
    await box.fill('Water the plants');
    await box.press('Enter');

    const item = app
      .getByRole('list', { name: 'Tasks' })
      .getByRole('listitem')
      .filter({ hasText: 'Water the plants' });
    await expect(item).toBeVisible();
    await expect(box).toHaveValue('');
    // The agent picks it up in its own layer.
    await expect(item.getByText('Running')).toBeVisible({ timeout: 20_000 });
  });

  test('watch a layer run: live preview updates and steps advance', async ({ app }) => {
    await app.goto('/?tab=layers');
    const card = app.getByRole('article', { name: 'Organize a test Downloads folder' });
    await card.scrollIntoViewIfNeeded(); // offscreen tiles intentionally do not update

    await expect(card.getByText('Using your screen')).toBeVisible();
    await expect(card.getByText('Running')).toBeVisible();

    // The live preview shows frames and keeps changing.
    const preview = card.getByRole('img', { name: 'Live preview of the layer' });
    await expect(preview).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    const first = await preview.getAttribute('src');
    await expect.poll(() => preview.getAttribute('src'), { timeout: 10_000 }).not.toBe(first);

    // Steps advance over time (the first step is only current for a couple of seconds, so
    // assert progress rather than catching one particular moment).
    await expect(card.getByText(/^Now: (Move PDFs|Move images)/)).toBeVisible({ timeout: 20_000 });
    await card.getByText(/Show steps/).click();
    await expect(
      card.getByRole('list', { name: 'Steps' }).getByText('Done: List files in Downloads'),
    ).toBeVisible();
  });

  test('approve an action and see the layer carry on', async ({ app }) => {
    await app.goto('/approvals');
    // The email layer raises an approval before sending.
    const card = app.getByRole('article', { name: /Send an email to team@example.com/ });
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText('the layer wants to');
    await expect(card).toContainText('Send a message');
    await expect(card.getByRole('img', { name: /looking at/ })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Approve' })).not.toBeFocused(); // never autofocused

    await card.getByRole('button', { name: 'Approve' }).click();
    await expect(card).toBeHidden();
    await expect(app.getByRole('list', { name: 'Pending approvals' })).toHaveCount(0);

    // It was recorded in the activity log once the layer sent the email.
    await app.goto('/log');
    await expect(app.getByText('Sent email "Friday plan"')).toBeVisible({ timeout: 20_000 });
  });

  test('deny an action', async ({ app, request }) => {
    await request.post('http://localhost:8787/__mock/approval');
    await app.goto('/approvals');
    const card = app.getByRole('article').first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Deny' }).click();
    await expect(app.getByText('Recently resolved')).toBeVisible();
    await expect(app.getByText('denied', { exact: true }).first()).toBeVisible();
  });

  test('keyboard: j/k move, a approves (desktop)', async ({ app, request }, info) => {
    test.skip(info.project.name === 'phone', 'keyboard shortcuts are for desktop');
    await request.post('http://localhost:8787/__mock/approval');
    await request.post('http://localhost:8787/__mock/approval');
    await app.goto('/approvals');
    const cards = app.getByRole('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute('data-selected', 'true');
    await app.keyboard.press('j');
    await expect(cards.nth(1)).toHaveAttribute('data-selected', 'true');
    await app.keyboard.press('a');
    await expect(cards).toHaveCount(1);
  });

  test('kill a layer with confirmation', async ({ app }) => {
    await app.goto('/?tab=layers');
    const card = app.getByRole('article', { name: 'Research a topic and write a summary file' });
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Kill' }).click();

    const dialog = app.getByRole('dialog', { name: 'Kill this layer?' });
    await expect(dialog).toBeVisible();
    // Cancel first: nothing happens.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByText('Killed')).toHaveCount(0);

    await card.getByRole('button', { name: 'Kill' }).click();
    await app
      .getByRole('dialog', { name: 'Kill this layer?' })
      .getByRole('button', { name: 'Kill layer' })
      .click();
    await expect(card.getByText('Killed')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Kill' })).toBeDisabled();
  });

  test('undo a file move from the activity log', async ({ app }) => {
    await app.goto('/log');
    const undo = app.getByRole('button', { name: 'Undo: Moved 4 PDFs to Downloads/Documents' });
    await expect(undo).toBeVisible({ timeout: 30_000 });
    await undo.click();
    await expect(app.getByText('Undone', { exact: true })).toBeVisible();
    await expect(undo).toBeHidden();
  });
});
