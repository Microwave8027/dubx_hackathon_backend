import { ApiError } from '@/transport/errors';
import { getTransport } from '@/transport';
import { detectTauri, invokeCommand } from '@/platform';
import { normalizeCalendar } from './normalize';
import type { CalendarDataset, CalendarSource } from './types';

class Listeners {
  private set = new Set<(d: CalendarDataset) => void>();
  subscribe(cb: (d: CalendarDataset) => void): () => void {
    this.set.add(cb);
    return () => this.set.delete(cb);
  }
  emit(d: CalendarDataset): void {
    this.set.forEach((cb) => cb(d));
  }
  /** Normalizes a pushed payload; a bad snapshot is ignored (the caller keeps the cached data). */
  ingest(raw: unknown): void {
    try {
      this.emit(normalizeCalendar(raw));
    } catch {
      /* malformed push: keep what we have; the next refetch will repair it */
    }
  }
}

export interface HttpOptions {
  /** Optional hint to the backend. The client never relies on it: it filters to the visible range itself. */
  getRange?: () => { from: Date; to: Date } | undefined;
}

/** GET {VITE_API_URL}/schedule through the active transport (so the phone and relay work too). */
export function createHttpCalendarSource(opts: HttpOptions = {}): CalendarSource {
  const listeners = new Listeners();
  return {
    async load() {
      const range = opts.getRange?.();
      const qs = range
        ? `?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
        : '';
      const res = await getTransport().request('GET', `/schedule${qs}`);
      if (res.status < 200 || res.status >= 300) {
        throw new ApiError(`GET /schedule failed (${res.status})`, res.status);
      }
      return normalizeCalendar(res.json);
    },
    subscribe: (cb) => listeners.subscribe(cb),
    ingest: (raw) => listeners.ingest(raw),
  };
}

// TODO(backend): confirm the Rust command name (and that it returns JSON, or a JSON string).
export const TAURI_CALENDAR_COMMAND = 'get_calendar_json';

/** Desktop only, enabled with VITE_CALENDAR_SOURCE=tauri. Same normalizer as the HTTP path. */
export function createTauriCalendarSource(): CalendarSource {
  const listeners = new Listeners();
  return {
    async load() {
      const raw = await invokeCommand<unknown>(TAURI_CALENDAR_COMMAND);
      return normalizeCalendar(typeof raw === 'string' ? JSON.parse(raw) : raw);
    },
    subscribe: (cb) => listeners.subscribe(cb),
    ingest: (raw) => listeners.ingest(raw),
  };
}

let active: CalendarSource | null = null;

export function getCalendarSource(): CalendarSource {
  active ??=
    import.meta.env.VITE_CALENDAR_SOURCE === 'tauri' && detectTauri()
      ? createTauriCalendarSource()
      : createHttpCalendarSource();
  return active;
}

/** Test seam. */
export function setCalendarSourceForTests(source: CalendarSource | null): void {
  active = source;
}
