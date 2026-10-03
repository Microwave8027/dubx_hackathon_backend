import { expect, test } from './fixtures';

// Everything here runs on /widget-preview: the real canvas, selectors and hover choreography with
// mock data and a fake platform adapter (it records calls instead of opening a window).

const waitingText = 'Draft a reply to the landlord';
const runningText = 'Summarise this week’s receipts';

test.describe('widget preview', () => {
  test('hover grows the window, then shows the planets', async ({ app, isMobile }) => {
    test.skip(isMobile, 'hover is a desktop interaction');
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    const planets = win.getByTestId('planet');

    await expect(win).toHaveAttribute('data-native', 'collapsed');
    expect((await win.boundingBox())?.width).toBe(96);
    expect((await win.boundingBox())?.height).toBe(48);
    await expect(planets).toHaveCount(3);
    await expect(planets.first()).toHaveCSS('opacity', '0');

    await win.hover();
    await expect(win).toHaveAttribute('data-native', 'expanded');
    expect((await win.boundingBox())?.width).toBe(320);
    expect((await win.boundingBox())?.height).toBe(320);
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-expanded', 'true');
    for (let i = 0; i < 3; i++) await expect(planets.nth(i)).toHaveCSS('opacity', '1');

    // Leaving: animate back first, then shrink the window.
    await app.mouse.move(2, 2);
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-expanded', 'false');
    await expect(win).toHaveAttribute('data-native', 'collapsed');
  });

  test('a planet label shows the task, its status and its current step', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' }); // planets hold still
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(win).toHaveAttribute('data-native', 'expanded');

    await win.getByRole('button', { name: new RegExp(waitingText) }).hover();
    const label = win.getByRole('status');
    await expect(label).toContainText(waitingText);
    await expect(label).toContainText('Waiting for approval');
    await expect(label).toContainText('Step 2 of 3: Collecting totals');
  });

  test('shows a +N planet once more than 7 tasks are running', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(win.getByTestId('planet-overflow')).toHaveCount(0);

    for (let i = 0; i < 4; i++) await app.getByRole('button', { name: 'Add task' }).click();
    await expect(app.getByText('7 tasks')).toBeVisible();
    await expect(win.getByTestId('planet')).toHaveCount(7);
    await expect(win.getByTestId('planet-overflow')).toHaveCount(0);

    await app.getByRole('button', { name: 'Add task' }).click();
    await expect(win.getByTestId('planet')).toHaveCount(7);
    await expect(win.getByTestId('planet-overflow')).toContainText('+1');

    for (let i = 0; i < 2; i++) await app.getByRole('button', { name: 'Add task' }).click();
    await expect(win.getByTestId('planet-overflow')).toContainText('+3');
  });

  test('with nothing running only a dimmed sun and "Nothing running" remain', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    await app.getByRole('button', { name: 'Clear tasks' }).click();
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(win.getByTestId('planet')).toHaveCount(0);
    await expect(win.getByRole('status')).toHaveText('Nothing running');
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-state', 'idle');
    await expect(win.getByRole('button', { name: 'Open Command Center' })).toHaveCSS(
      'opacity',
      '0.55',
    );
  });

  test('animates orbits only while expanded, and holds still for reduced motion', async ({
    app,
  }) => {
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    const orbit = win.locator('.wg-orbit').first();
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-motion', 'animated');
    await expect(orbit).toHaveCSS('animation-name', 'wg-orbit');
    await expect(orbit).toHaveCSS('animation-play-state', 'paused'); // collapsed: idle CPU stays low
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(orbit).toHaveCSS('animation-play-state', 'running');

    // The in-page override behaves like the OS setting.
    await app.getByLabel('Reduce motion').check();
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-motion', 'static');
    await expect(orbit).toHaveCSS('animation-name', 'none');
  });

  test('prefers-reduced-motion renders static planets that still fade in', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    const planet = win.getByTestId('planet').first();
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-motion', 'static');
    await expect(win.locator('.wg-orbit').first()).toHaveCSS('animation-name', 'none');
    await expect(planet).toHaveCSS('opacity', '0');
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(planet).toHaveCSS('opacity', '1');
    const before = await planet.boundingBox();
    await app.waitForTimeout(600);
    expect(await planet.boundingBox()).toEqual(before);
  });

  test('clicks call the platform adapter with the right target', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    const calls = app.getByTestId('calls');
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(win).toHaveAttribute('data-native', 'expanded');

    await win.getByRole('button', { name: 'Open Command Center' }).click();
    await expect(calls).toContainText('openCommandCenter {}');

    await win.getByRole('button', { name: new RegExp(runningText) }).click();
    await expect(calls).toContainText('openCommandCenter {"layerId":"l1"}');

    // A planet waiting for approval opens the approval.
    await win.getByRole('button', { name: new RegExp(waitingText) }).click();
    await expect(calls).toContainText('openCommandCenter {"approvalId":"a2"}');

    // The +N planet opens the Command Center.
    for (let i = 0; i < 5; i++) await app.getByRole('button', { name: 'Add task' }).click();
    await app.getByTestId('calls').scrollIntoViewIfNeeded();
    await win.getByTestId('planet-overflow').click();
    await expect(calls.locator('li').last()).toHaveText('openCommandCenter {}');
  });

  test('shows the pending approval count and a needs-you sun', async ({ app }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-state', 'needs-you');
    await expect(win.getByLabel('1 waiting for approval')).toHaveText('1');
  });

  test('progress arcs are centred on their planets and static planets are spread out', async ({
    app,
  }) => {
    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.goto('/widget-preview');
    const win = app.getByTestId('widget-window');
    await app.getByRole('button', { name: 'Expand widget' }).click();
    await expect(win.getByTestId('widget-canvas')).toHaveAttribute('data-expanded', 'true');
    const center = async (loc: ReturnType<typeof win.locator>) => {
      const b = await loc.boundingBox();
      return { x: (b?.x ?? 0) + (b?.width ?? 0) / 2, y: (b?.y ?? 0) + (b?.height ?? 0) / 2 };
    };
    const arcs = win.locator('.wg-planet-arc');
    const bodies = win.locator('.wg-planet-body');
    const centers: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await center(arcs.nth(i));
      const b = await center(bodies.nth(i));
      expect(Math.abs(a.x - b.x)).toBeLessThan(1.5);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1.5);
      centers.push(b);
    }
    // The reference board (which shares the OS setting) must not stack planets on one spot either.
    const refBodies = app.getByTestId('widget-ref-expanded').locator('.wg-planet-body');
    const ref: { x: number; y: number }[] = [];
    for (let i = 0; i < 3; i++) ref.push(await center(refBodies.nth(i)));
    for (const set of [centers, ref]) {
      for (let i = 0; i < set.length; i++) {
        for (let j = i + 1; j < set.length; j++) {
          expect(Math.hypot(set[i]!.x - set[j]!.x, set[i]!.y - set[j]!.y)).toBeGreaterThan(20);
        }
      }
    }
  });

  test('both sizes are drawn for design review', async ({ app }) => {
    await app.goto('/widget-preview');
    await expect(app.getByTestId('widget-ref-collapsed')).toBeVisible();
    await expect(app.getByTestId('widget-ref-expanded')).toBeVisible();
    expect((await app.getByTestId('widget-ref-collapsed').boundingBox())?.width).toBe(96);
    expect((await app.getByTestId('widget-ref-expanded').boundingBox())?.height).toBe(320);
  });
});
