import type { ScheduleEvent } from './types';
import { addDays, formatEventTime, groupByDay, isSameDay, occursOn, startOfWeek } from './range';

const ev = (
  id: string,
  start: Date,
  end: Date,
  extra: Partial<ScheduleEvent> = {},
): ScheduleEvent => ({
  id,
  title: id,
  start,
  end,
  allDay: false,
  calendarName: 'Test',
  tentative: false,
  cancelled: false,
  ...extra,
});

// Local-time constructors: the tests do not depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('week math', () => {
  it('starts the week on Monday', () => {
    expect(startOfWeek(at(2026, 10, 3, 15))).toEqual(at(2026, 9, 28)); // Sat -> Mon
    expect(startOfWeek(at(2026, 9, 28))).toEqual(at(2026, 9, 28)); // Mon -> itself
    expect(startOfWeek(at(2026, 10, 4))).toEqual(at(2026, 9, 28)); // Sun -> previous Mon
  });

  it('adds calendar days across a month and a year boundary', () => {
    expect(addDays(at(2026, 12, 31), 1)).toEqual(at(2027, 1, 1));
    expect(addDays(at(2026, 3, 1), -1)).toEqual(at(2026, 2, 28));
  });

  it('adds calendar days across a DST change without drifting an hour', () => {
    const next = addDays(at(2026, 3, 7), 2); // US spring forward on 8 Mar
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(9);
  });

  it('compares days', () => {
    expect(isSameDay(at(2026, 10, 3, 1), at(2026, 10, 3, 23))).toBe(true);
    expect(isSameDay(at(2026, 10, 3), at(2026, 10, 4))).toBe(false);
  });
});

describe('occursOn', () => {
  it('matches a timed event on its day only', () => {
    const e = ev('a', at(2026, 10, 3, 9), at(2026, 10, 3, 10));
    expect(occursOn(e, at(2026, 10, 3))).toBe(true);
    expect(occursOn(e, at(2026, 10, 2))).toBe(false);
    expect(occursOn(e, at(2026, 10, 4))).toBe(false);
  });

  it('spans a night: an event ending at midnight does not leak into the next day', () => {
    const e = ev('a', at(2026, 10, 3, 22), at(2026, 10, 4, 0));
    expect(occursOn(e, at(2026, 10, 3))).toBe(true);
    expect(occursOn(e, at(2026, 10, 4))).toBe(false);
  });

  it('shows an overnight event on both days', () => {
    const e = ev('a', at(2026, 10, 3, 22), at(2026, 10, 4, 2));
    expect(occursOn(e, at(2026, 10, 3))).toBe(true);
    expect(occursOn(e, at(2026, 10, 4))).toBe(true);
  });

  it('treats the all-day end as exclusive', () => {
    const e = ev('trip', at(2026, 10, 3), at(2026, 10, 5), { allDay: true }); // 3rd and 4th
    expect(occursOn(e, at(2026, 10, 3))).toBe(true);
    expect(occursOn(e, at(2026, 10, 4))).toBe(true);
    expect(occursOn(e, at(2026, 10, 5))).toBe(false);
  });

  it('keeps a zero-length event on its start day', () => {
    const e = ev('a', at(2026, 10, 3, 12), at(2026, 10, 3, 12));
    expect(occursOn(e, at(2026, 10, 3))).toBe(true);
  });
});

describe('groupByDay', () => {
  it('returns every day, orders all-day first then by start, and drops cancelled events', () => {
    const events = [
      ev('late', at(2026, 10, 3, 15), at(2026, 10, 3, 16)),
      ev('early', at(2026, 10, 3, 8), at(2026, 10, 3, 9)),
      ev('holiday', at(2026, 10, 3), at(2026, 10, 4), { allDay: true }),
      ev('gone', at(2026, 10, 3, 10), at(2026, 10, 3, 11), { cancelled: true }),
      ev('tomorrow', at(2026, 10, 4, 9), at(2026, 10, 4, 10)),
    ];
    const days = groupByDay(events, at(2026, 10, 3, 14), 3);
    expect(days).toHaveLength(3);
    expect(days[0]!.events.map((e) => e.id)).toEqual(['holiday', 'early', 'late']);
    expect(days[1]!.events.map((e) => e.id)).toEqual(['tomorrow']);
    expect(days[2]!.events).toEqual([]);
  });
});

describe('formatEventTime', () => {
  it('says All day for all-day events', () => {
    expect(
      formatEventTime(ev('a', at(2026, 10, 3), at(2026, 10, 4), { allDay: true }), at(2026, 10, 3)),
    ).toBe('All day');
  });

  it('formats a same-day range with both times', () => {
    const text = formatEventTime(
      ev('a', at(2026, 10, 3, 9), at(2026, 10, 3, 10, 15)),
      at(2026, 10, 3),
    );
    expect(text).toMatch(/9:00/);
    expect(text).toMatch(/10:15/);
    expect(text).toContain('–');
  });

  it('describes the two halves of an overnight event', () => {
    const e = ev('a', at(2026, 10, 3, 22), at(2026, 10, 4, 2));
    expect(formatEventTime(e, at(2026, 10, 3))).toMatch(/^From /);
    expect(formatEventTime(e, at(2026, 10, 4))).toMatch(/^Until /);
  });
});
