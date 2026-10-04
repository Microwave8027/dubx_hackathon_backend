import type { ScheduleEvent } from './types';

const DAY_MS = 24 * 60 * 60_000;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Calendar-day arithmetic (not 24h), so it stays correct across daylight-saving changes. */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const sinceMonday = (day.getDay() + 6) % 7;
  return addDays(day, -sinceMonday);
}

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** Does the event touch the local day starting at `day`? All-day ends are exclusive. */
export function occursOn(event: ScheduleEvent, day: Date): boolean {
  const from = startOfDay(day).getTime();
  const to = addDays(day, 1).getTime();
  const start = event.start.getTime();
  const end = event.end.getTime();
  // A zero-length event still belongs to the day it starts on.
  if (end <= start) return start >= from && start < to;
  return start < to && end > from;
}

const byStart = (a: ScheduleEvent, b: ScheduleEvent): number =>
  Number(b.allDay) - Number(a.allDay) ||
  a.start.getTime() - b.start.getTime() ||
  a.title.localeCompare(b.title);

export interface DayGroup {
  day: Date;
  events: ScheduleEvent[];
}

/** `count` consecutive days from `first`, each with its events (all-day first, then by start). */
export function groupByDay(events: ScheduleEvent[], first: Date, count: number): DayGroup[] {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(startOfDay(first), i);
    return { day, events: events.filter((e) => !e.cancelled && occursOn(e, day)).sort(byStart) };
  });
}

/** Whole local days an event spans (all-day events: end is exclusive). */
export function daySpan(event: ScheduleEvent): number {
  return Math.max(
    1,
    Math.round((startOfDay(event.end).getTime() - startOfDay(event.start).getTime()) / DAY_MS),
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "9:00 AM – 10:15 AM", "All day", or "Continues" / "Until 2:00 PM" for events crossing midnight. */
export function formatEventTime(event: ScheduleEvent, day: Date): string {
  if (event.allDay) return 'All day';
  const startsToday = isSameDay(event.start, day);
  const endsToday =
    isSameDay(event.end, day) || event.end.getTime() <= startOfDay(addDays(day, 1)).getTime();
  if (startsToday && endsToday)
    return `${timeFmt.format(event.start)} – ${timeFmt.format(event.end)}`;
  if (startsToday) return `From ${timeFmt.format(event.start)}`;
  if (endsToday) return `Until ${timeFmt.format(event.end)}`;
  return 'All day';
}
