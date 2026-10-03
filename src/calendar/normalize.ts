/*
 * THE ONLY FILE THAT KNOWS THE CALENDAR PAYLOAD SHAPE.
 * The Rust side's field names are not final. If they change, edit this file (and its tests);
 * nothing else in the app should need to. See docs/calendar-payload.md for the assumed shape.
 */
import { z } from 'zod';
import type { CalendarDataset, ScheduleEvent } from './types';

export class CalendarFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarFormatError';
  }
}

// Loose on purpose: unknown fields are ignored and each event is validated on its own,
// so one bad event never takes the whole calendar down.
const DatasetSchema = z.union([
  z.array(z.unknown()),
  z.object({
    events: z.array(z.unknown()),
    timezone: z.string().nullish(),
    fetchedAt: z.unknown().optional(),
  }),
]);

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

// ---------- time parsing ----------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

interface Parsed {
  date: Date;
  dateOnly: boolean;
}

function validZone(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** Offset (ms) of `tz` from UTC at the instant `ms`. */
function zoneOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in a named zone to an instant. Two passes settle DST boundaries. */
function zonedToDate(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = naiveUtc - zoneOffsetMs(naiveUtc, tz);
  guess = naiveUtc - zoneOffsetMs(guess, tz);
  return new Date(guess);
}

function parseString(value: string, tz: string | undefined): Parsed | null {
  const v = value.trim();
  const dateOnly = DATE_ONLY.exec(v);
  if (dateOnly) {
    const [y, m, d] = [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
    const date = new Date(y, m - 1, d); // local midnight, never routed through UTC
    if (date.getMonth() !== m - 1 || date.getDate() !== d) return null; // e.g. 2026-02-31
    return { date, dateOnly: true };
  }
  if (/^\d{9,13}$/.test(v)) return parseNumber(Number(v));
  const naive = NAIVE.exec(v);
  if (naive && !HAS_OFFSET.test(v)) {
    const [y, mo, d, h, mi, s] = naive.slice(1).map((x) => Number(x ?? 0)) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const date = tz ? zonedToDate(y, mo, d, h, mi, s, tz) : new Date(y, mo - 1, d, h, mi, s);
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
  }
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

function parseNumber(n: number): Parsed | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  // Below 1e12 is seconds (1e12 ms is 2001; 1e12 s is year 33658).
  const date = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

function parseTime(value: unknown, datasetTz: string | undefined): Parsed | null {
  if (typeof value === 'string') return parseString(value, datasetTz);
  if (typeof value === 'number') return parseNumber(value);
  if (typeof value === 'object' && value !== null) {
    // Google style: { date } or { dateTime, timeZone? }
    const o = value as Record<string, unknown>;
    const date = str(o.date);
    if (date) return parseString(date, datasetTz);
    const dt = str(o.dateTime);
    if (dt) return parseString(dt, validZone(str(o.timeZone)) ?? datasetTz);
  }
  return null;
}

const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ---------- events ----------

/** Stable id for events that arrive without one. */
function derivedId(title: string, startMs: number): string {
  let h = 5381;
  const s = `${title}|${startMs}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `gen_${(h >>> 0).toString(16)}`;
}

type EventResult =
  { kind: 'event'; event: ScheduleEvent } | { kind: 'cancelled' } | { kind: 'invalid' };

function normalizeEvent(raw: unknown, tz: string | undefined): EventResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'invalid' };
  const o = raw as Record<string, unknown>;

  const status = str(o.status)?.toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return { kind: 'cancelled' };

  const start = parseTime(pick(o, 'start', 'startTime', 'start_time'), tz);
  if (!start) return { kind: 'invalid' };
  const rawEnd = pick(o, 'end', 'endTime', 'end_time');
  const end = rawEnd === undefined ? null : parseTime(rawEnd, tz);
  if (rawEnd !== undefined && !end) return { kind: 'invalid' };

  const flag = pick(o, 'allDay', 'all_day');
  const allDay = flag === true || (flag === undefined && start.dateOnly);

  let s = start.date;
  let e: Date;
  if (allDay) {
    // All-day events are floating local dates; the end is exclusive.
    s = startOfLocalDay(s);
    e = end ? startOfLocalDay(end.date) : addDays(s, 1);
    if (e.getTime() <= s.getTime()) e = addDays(s, 1);
  } else {
    e = end ? end.date : new Date(s.getTime() + 60 * 60_000);
    if (e.getTime() < s.getTime()) return { kind: 'invalid' };
  }

  const title = str(pick(o, 'title', 'summary')) ?? '(No title)';
  const id = str(o.id) ?? (typeof o.id === 'number' ? String(o.id) : derivedId(title, s.getTime()));
  const color = str(o.color);

  return {
    kind: 'event',
    event: {
      id,
      title,
      start: s,
      end: e,
      allDay,
      calendarName: str(pick(o, 'calendar', 'calendarName', 'calendar_name')) ?? '',
      color: color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined,
      location: str(o.location),
      description: str(o.description),
      tentative: status === 'tentative',
      cancelled: false,
    },
  };
}

/** Raw payload (any supported shape) to the normalized dataset. Throws CalendarFormatError. */
export function normalizeCalendar(raw: unknown): CalendarDataset {
  const parsed = DatasetSchema.safeParse(raw);
  if (!parsed.success)
    throw new CalendarFormatError('Calendar payload is not an array or { events }');

  const list = Array.isArray(parsed.data) ? parsed.data : parsed.data.events;
  const tz = Array.isArray(parsed.data) ? undefined : validZone(parsed.data.timezone ?? undefined);
  const fetchedRaw = Array.isArray(parsed.data) ? undefined : parsed.data.fetchedAt;
  const fetched = fetchedRaw === undefined ? null : parseTime(fetchedRaw, tz);

  const seen = new Set<string>();
  const events: ScheduleEvent[] = [];
  let skipped = 0;
  for (const item of list) {
    const r = normalizeEvent(item, tz);
    if (r.kind === 'invalid') skipped++;
    else if (r.kind === 'event' && !seen.has(r.event.id)) {
      seen.add(r.event.id);
      events.push(r.event);
    }
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));

  // One warning per load, never per event.
  if (skipped > 0) {
    // eslint-disable-next-line no-console -- the spec asks for exactly one warn per load
    console.warn(`Calendar: skipped ${skipped} invalid event${skipped === 1 ? '' : 's'}`);
  }
  return { events, timezone: tz, fetchedAt: fetched?.date, skipped };
}
