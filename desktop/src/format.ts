const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

export const fmtTime = (iso: string | Date) => time.format(new Date(iso));

export function fmtRange(start: string, stop: string) {
  return `${fmtTime(start)} – ${fmtTime(stop)}`;
}

export function startOfDay(d = new Date()) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function fmtDay(d: Date) {
  const today = startOfDay();
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return day.format(d);
}

/** "in 5 min", "in 2 h 10 min", "now". */
export function fmtCountdown(iso: string, now = Date.now()) {
  const mins = Math.ceil((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `in ${Math.round(h / 24)} d`;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}
