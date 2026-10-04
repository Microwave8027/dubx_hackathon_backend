const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Mon, Oct 5, 9:00 AM – 11:00 AM", or both dates when it crosses midnight. */
export function whenText(start: Date | string, stop: Date | string): string {
  const s = new Date(start);
  const e = new Date(stop);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'Unknown time';
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${dayFmt.format(s)}, ${timeFmt.format(s)} – ${timeFmt.format(e)}`
    : `${dayFmt.format(s)} ${timeFmt.format(s)} – ${dayFmt.format(e)} ${timeFmt.format(e)}`;
}
