import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const MOCK = 'http://localhost:8787';

interface Loaded {
  count: number;
  skipped: number;
  titles: string[];
  hasCurrent: boolean;
  hasUpcoming: boolean;
  allDayStartsAtLocalMidnight: boolean;
}

/** Runs the app's real source + normalizer inside the browser (no calendar view exists yet). */
async function loadInBrowser(page: Page): Promise<Loaded> {
  return page.evaluate(async () => {
    // Playwright rewrites static import() in test code, so go through Function.
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<{
      getCalendarSource: () => {
        load: () => Promise<{
          skipped: number;
          events: { title: string; start: Date; end: Date; allDay: boolean }[];
        }>;
      };
    }>;
    const { getCalendarSource } = await load('/src/calendar/source.ts');
    const ds = await getCalendarSource().load();
    const now = Date.now();
    const allDay = ds.events.find((e) => e.allDay);
    return {
      count: ds.events.length,
      skipped: ds.skipped,
      titles: ds.events.map((e) => e.title),
      hasCurrent: ds.events.some(
        (e) => !e.allDay && e.start.getTime() <= now && now <= e.end.getTime(),
      ),
      hasUpcoming: ds.events.some((e) => e.start.getTime() > now),
      allDayStartsAtLocalMidnight:
        !allDay || (allDay.start.getHours() === 0 && allDay.start.getMinutes() === 0),
    };
  });
}

test.describe('calendar data', () => {
  test('GET /schedule is in the documented shape, relative to now, and ignores from/to', async ({
    app,
    request,
  }) => {
    void app;
    const res = await request.get(`${MOCK}/schedule`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.timezone).toBe('string');
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();
    const now = Date.now();
    const timed = (body.events as { start: string; end: string; allDay?: boolean }[]).filter(
      (e) => !e.allDay,
    );
    expect(timed.some((e) => Date.parse(e.start) <= now && now <= Date.parse(e.end))).toBe(true);
    expect(timed.some((e) => Date.parse(e.start) > now)).toBe(true);

    const ranged = await request.get(`${MOCK}/schedule?from=2001-01-01&to=2001-01-02`);
    expect((await ranged.json()).events).toHaveLength(body.events.length);
  });

  test('the app loads the calendar through its own normalizer', async ({ app }) => {
    await app.goto('/');
    const ds = await loadInBrowser(app);
    expect(ds.count).toBeGreaterThan(3);
    expect(ds.skipped).toBe(0);
    expect(ds.titles).toContain('Math homework');
    expect(ds.titles).not.toContain('Pop quiz (cancelled)'); // cancelled events are dropped
    expect(ds.hasCurrent).toBe(true);
    expect(ds.hasUpcoming).toBe(true);
    expect(ds.allDayStartsAtLocalMidnight).toBe(true);
  });

  test('a pushed snapshot reaches the app without a reload', async ({ app, request }) => {
    await app.goto('/');
    // Wait for the live connection, then subscribe the way the calendar query does.
    await expect(app.getByRole('list', { name: 'Tasks' })).toBeVisible();
    const origin = await app.evaluate(() => performance.timeOrigin);
    await app.evaluate(async () => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<{
        getCalendarSource: () => {
          subscribe: (cb: (d: { events: { title: string }[] }) => void) => void;
        };
      }>;
      const { getCalendarSource } = await load('/src/calendar/source.ts');
      const w = window as unknown as { __snapshots: string[][] };
      w.__snapshots = [];
      getCalendarSource().subscribe((d) => w.__snapshots.push(d.events.map((e) => e.title)));
    });

    await request.post(`${MOCK}/__mock/calendar/push?type=snapshot`);
    await expect
      .poll(() =>
        app.evaluate(() => (window as unknown as { __snapshots: string[][] }).__snapshots.flat()),
      )
      .toContain('Pushed snapshot #1');

    // Same page load: nothing reloaded.
    expect(await app.evaluate(() => performance.timeOrigin)).toBe(origin);
  });

  test('a calendar.updated push with no payload does not feed the cache a bogus snapshot', async ({
    app,
    request,
  }) => {
    await app.goto('/');
    await expect(app.getByRole('list', { name: 'Tasks' })).toBeVisible();
    await app.evaluate(async () => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<{
        getCalendarSource: () => { subscribe: (cb: () => void) => void };
      }>;
      const { getCalendarSource } = await load('/src/calendar/source.ts');
      const w = window as unknown as { __n: number };
      w.__n = 0;
      getCalendarSource().subscribe(() => w.__n++);
    });
    await request.post(`${MOCK}/__mock/calendar/push?type=updated`);
    await app.waitForTimeout(800);
    expect(await app.evaluate(() => (window as unknown as { __n: number }).__n)).toBe(0);
  });
});

test.describe('calendar data: messy payload', () => {
  test.use({ allowConsole: [/skipped \d+ invalid event/] });

  test('skipped events are counted and the rest is still usable', async ({ app, request }) => {
    await request.post(`${MOCK}/__mock/calendar?mode=bad`);
    await app.goto('/');
    const ds = await loadInBrowser(app);
    expect(ds.skipped).toBeGreaterThanOrEqual(4); // end-before-start, garbage, missing start, junk
    expect(ds.count).toBeGreaterThan(5);
    expect(ds.titles).toEqual(
      expect.arrayContaining(['Math homework', 'Google-style event', 'Epoch seconds']),
    );
    expect(ds.titles).not.toContain('Garbage time');
  });

  test('?demo=calendar-bad and ?demo=calendar-full switch the mock payload', async ({
    app,
    request,
  }) => {
    await app.goto('/?demo=calendar-bad');
    await expect(app).toHaveURL(/\/$/); // the flag is consumed
    const bad = await (await request.get(`${MOCK}/schedule`)).json();
    expect((bad.events as unknown[]).some((e) => typeof e !== 'object' || e === null)).toBe(true);

    await app.goto('/?demo=calendar-full');
    const full = await (await request.get(`${MOCK}/schedule`)).json();
    expect(full.events.length).toBeGreaterThanOrEqual(30);
  });
});
