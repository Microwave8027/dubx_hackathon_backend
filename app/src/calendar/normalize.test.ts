// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { CalendarFormatError, normalizeCalendar } from './normalize';
import type { ScheduleEvent } from './types';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(__dirname, '../../fixtures/calendar', `${name}.json`), 'utf8'));
const iso = (d: Date | undefined) => d?.toISOString();
const byId = (events: ScheduleEvent[], id: string) => {
  const e = events.find((x) => x.id === id);
  if (!e) throw new Error(`event ${id} missing`);
  return e;
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('canonical payload', () => {
  const ds = normalizeCalendar(fixture('canonical'));

  it('maps every field and carries timezone and fetchedAt for the stale banner', () => {
    expect(ds.timezone).toBe('America/Los_Angeles');
    expect(iso(ds.fetchedAt)).toBe('2026-10-03T18:00:00.000Z');
    expect(ds.skipped).toBe(0);
    const e = byId(ds.events, 'evt_1');
    expect(e).toMatchObject({
      title: 'Math homework',
      calendarName: 'School',
      color: '#4285f4',
      allDay: false,
      tentative: false,
      cancelled: false,
    });
    expect(iso(e.start)).toBe('2026-10-03T22:00:00.000Z');
    expect(iso(e.end)).toBe('2026-10-03T23:15:00.000Z');
    expect(e.location).toBeUndefined(); // null means absent
    expect(e.description).toBeUndefined();
  });

  it('marks tentative and keeps the description', () => {
    const e = byId(ds.events, 'evt_2');
    expect(e.tentative).toBe(true);
    expect(e.description).toContain('https://docs.google.com/document/d/example');
  });

  it('sorts by start time', () => {
    const starts = ds.events.map((e) => e.start.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('aliases', () => {
  it('accepts title|summary, calendar|calendarName|calendar_name, allDay|all_day, start|startTime|start_time', () => {
    const ds = normalizeCalendar({
      events: [
        { id: 'a', summary: 'S', calendarName: 'X', all_day: true, startTime: '2026-10-05' },
        {
          id: 'b',
          title: 'T',
          calendar_name: 'Y',
          start_time: '2026-10-05T10:00:00Z',
          end_time: '2026-10-05T11:00:00Z',
        },
        {
          id: 'c',
          title: 'U',
          calendar: 'Z',
          start: '2026-10-05T10:00:00Z',
          endTime: '2026-10-05T10:30:00Z',
        },
      ],
    });
    expect(byId(ds.events, 'a')).toMatchObject({ title: 'S', calendarName: 'X', allDay: true });
    expect(byId(ds.events, 'b')).toMatchObject({ title: 'T', calendarName: 'Y' });
    expect(byId(ds.events, 'c')).toMatchObject({ title: 'U', calendarName: 'Z' });
  });

  it('ignores unknown fields and accepts both spellings of cancelled', () => {
    const ds = normalizeCalendar([
      { id: 'a', title: 'A', start: '2026-10-05T10:00:00Z', weird: { nested: true } },
      { id: 'b', title: 'B', start: '2026-10-05T10:00:00Z', status: 'canceled' },
    ]);
    expect(ds.events.map((e) => e.id)).toEqual(['a']);
    expect(ds.skipped).toBe(0); // cancelled is not an error
  });
});

describe('Google-style times', () => {
  const ds = normalizeCalendar(fixture('google-style'));

  it('reads { dateTime, timeZone } and an epoch fetchedAt', () => {
    expect(iso(ds.fetchedAt)).toBe('2026-10-03T18:00:00.000Z');
    expect(iso(byId(ds.events, 'g1').start)).toBe('2026-10-03T14:00:00.000Z');
  });

  it("uses the event's own timeZone for a naive dateTime, not the dataset's", () => {
    // 13:00 in Los Angeles (PDT, UTC-7) even though the dataset zone is New York.
    expect(iso(byId(ds.events, 'g2').start)).toBe('2026-10-03T20:00:00.000Z');
  });

  it('reads { date } as a local all-day range with an exclusive end', () => {
    const e = byId(ds.events, 'g3');
    expect(e.allDay).toBe(true);
    expect([e.start.getMonth(), e.start.getDate()]).toEqual([9, 12]);
    expect([e.end.getMonth(), e.end.getDate()]).toEqual([9, 14]);
  });
});

describe('epoch timestamps', () => {
  const ds = normalizeCalendar(fixture('epoch-seconds'));

  it('treats values below 1e12 as seconds and larger ones as milliseconds', () => {
    expect(iso(byId(ds.events, 's1').start)).toBe('2026-10-03T18:00:00.000Z');
    expect(iso(byId(ds.events, 's1').end)).toBe('2026-10-03T19:00:00.000Z');
    expect(iso(byId(ds.events, 's2').start)).toBe('2026-10-03T19:00:00.000Z');
    expect(iso(byId(ds.events, 's2').end)).toBe('2026-10-03T20:00:00.000Z');
  });

  it('accepts numeric strings too', () => {
    const e = normalizeCalendar([{ id: 'x', title: 'x', start: '1791050400' }]).events[0];
    expect(iso(e?.start)).toBe('2026-10-03T18:00:00.000Z');
  });
});

describe('naive datetimes', () => {
  it('are read in the dataset timezone, including across DST changes', () => {
    const ds = normalizeCalendar(fixture('naive-datetime'));
    expect(iso(byId(ds.events, 'n1').start)).toBe('2026-10-31T16:00:00.000Z'); // PDT, UTC-7
    expect(iso(byId(ds.events, 'n2').start)).toBe('2026-11-01T17:00:00.000Z'); // PST, UTC-8 (after fall back)
    expect(iso(byId(ds.events, 'n3').start)).toBe('2026-03-08T16:00:00.000Z'); // PDT (after spring forward)
  });

  it('survive a time that does not exist (spring-forward gap) without throwing', () => {
    const e = byId(normalizeCalendar(fixture('naive-datetime')).events, 'n4');
    expect(Number.isNaN(e.start.getTime())).toBe(false);
    expect(e.end.getTime() - e.start.getTime()).toBe(60 * 60_000);
  });

  it('fall back to the local zone when the dataset has none', () => {
    const ds = normalizeCalendar([{ id: 'l', title: 'l', start: '2026-10-03T09:00:00' }]);
    const s = ds.events[0]!.start;
    expect([s.getHours(), s.getMinutes()]).toEqual([9, 0]);
  });

  it('ignore an invalid dataset zone instead of failing', () => {
    const ds = normalizeCalendar({
      timezone: 'Not/AZone',
      events: [{ id: 'z', title: 'z', start: '2026-10-03T09:00:00' }],
    });
    expect(ds.timezone).toBeUndefined();
    expect(ds.events).toHaveLength(1);
  });
});

describe.each(['America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Auckland', 'UTC'])(
  'date-only all-day events in %s',
  (zone) => {
    const original = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it('stay on the same local date (no off-by-one) with an exclusive end', () => {
      const e = normalizeCalendar(fixture('canonical')).events.find((x) => x.id === 'evt_3')!;
      expect([
        e.start.getFullYear(),
        e.start.getMonth(),
        e.start.getDate(),
        e.start.getHours(),
      ]).toEqual([2026, 9, 5, 0]);
      expect([e.end.getFullYear(), e.end.getMonth(), e.end.getDate(), e.end.getHours()]).toEqual([
        2026, 9, 6, 0,
      ]);
    });

    it('a single date with no end lasts one local day', () => {
      const e = normalizeCalendar([{ id: 'd', title: 'd', start: '2026-12-31' }]).events[0]!;
      expect([e.end.getFullYear(), e.end.getMonth(), e.end.getDate()]).toEqual([2027, 0, 1]);
    });
  },
);

describe('all-day events on a DST-change day', () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('is 25 hours long when clocks go back and 23 when they go forward', () => {
    const back = normalizeCalendar([{ id: 'b', title: 'b', start: '2026-11-01' }]).events[0]!;
    expect((back.end.getTime() - back.start.getTime()) / 3_600_000).toBe(25);
    const fwd = normalizeCalendar([{ id: 'f', title: 'f', start: '2026-03-08' }]).events[0]!;
    expect((fwd.end.getTime() - fwd.start.getTime()) / 3_600_000).toBe(23);
  });
});

describe('ends and ids', () => {
  it('defaults a missing end on a timed event to start + 60 minutes', () => {
    const e = normalizeCalendar(fixture('top-level-array')).events.find(
      (x) => x.title === 'No id, no end',
    )!;
    expect(e.end.getTime() - e.start.getTime()).toBe(60 * 60_000);
  });

  it('derives a stable id when none is given', () => {
    const a = normalizeCalendar(fixture('top-level-array')).events.find(
      (x) => x.title === 'No id, no end',
    )!;
    const b = normalizeCalendar(fixture('top-level-array')).events.find(
      (x) => x.title === 'No id, no end',
    )!;
    expect(a.id).toMatch(/^gen_[0-9a-f]+$/);
    expect(a.id).toBe(b.id);
  });

  it('keeps a zero-length event but drops one that ends before it starts', () => {
    const ds = normalizeCalendar([
      { id: 'z', title: 'z', start: '2026-10-03T10:00:00Z', end: '2026-10-03T10:00:00Z' },
      { id: 'n', title: 'n', start: '2026-10-03T10:00:00Z', end: '2026-10-03T09:59:59Z' },
    ]);
    expect(ds.events.map((e) => e.id)).toEqual(['z']);
    expect(ds.skipped).toBe(1);
  });

  it('snaps an all-day event given datetimes to local days and keeps the end exclusive', () => {
    const e = normalizeCalendar([
      {
        id: 'a',
        title: 'a',
        allDay: true,
        start: '2026-10-05T00:00:00',
        end: '2026-10-06T00:00:00',
      },
    ]).events[0]!;
    expect(e.allDay).toBe(true);
    expect(e.end.getDate() - e.start.getDate()).toBe(1);
  });

  it('reads a top-level array', () => {
    const ds = normalizeCalendar(fixture('top-level-array'));
    expect(ds.events).toHaveLength(2);
    expect(ds.timezone).toBeUndefined();
  });
});

describe('messy payload', () => {
  it('drops cancelled and invalid events, counts the invalid ones, and warns once', () => {
    const ds = normalizeCalendar(fixture('messy'));
    expect(ds.events.map((e) => e.id).sort()).toEqual(['ok1', 'ok2']);
    // end-before-start, garbage time, missing start, impossible date, a string, null
    expect(ds.skipped).toBe(6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('6');
    expect(byId(ds.events, 'ok2').tentative).toBe(true);
  });

  it('keeps the first of two events sharing an id', () => {
    const ds = normalizeCalendar(fixture('messy'));
    expect(byId(ds.events, 'ok1').title).toBe('Fine event');
  });

  it('does not warn when nothing was skipped', () => {
    normalizeCalendar(fixture('canonical'));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('unusable payloads', () => {
  it('throw a CalendarFormatError', () => {
    for (const bad of [null, 'nope', 42, {}, { events: 'x' }]) {
      expect(() => normalizeCalendar(bad)).toThrow(CalendarFormatError);
    }
  });

  it('an empty list is a valid, empty calendar', () => {
    expect(normalizeCalendar([])).toMatchObject({ events: [], skipped: 0 });
  });
});

describe('the backend /schedule shape (name, stop, id)', () => {
  it('reads name as the title and stop as the end', () => {
    const { events, skipped } = normalizeCalendar([
      {
        id: 'abc123',
        name: 'Deep work',
        description: 'Focus',
        start: '2026-10-05T09:00:00.000Z',
        stop: '2026-10-05T11:00:00.000Z',
        color: '#039BE5',
      },
    ]);
    expect(skipped).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'abc123',
      title: 'Deep work',
      description: 'Focus',
      color: '#039BE5',
    });
    expect(events[0]!.end.getTime() - events[0]!.start.getTime()).toBe(2 * 3_600_000);
  });

  it('prefers title and end when both spellings are present', () => {
    const { events } = normalizeCalendar([
      {
        id: 'x',
        title: 'A',
        name: 'B',
        start: '2026-10-05T09:00:00Z',
        end: '2026-10-05T10:00:00Z',
        stop: '2026-10-05T12:00:00Z',
      },
    ]);
    expect(events[0]!.title).toBe('A');
    expect(events[0]!.end.toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });
});
