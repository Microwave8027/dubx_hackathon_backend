import type { OAuth2Client } from "google-auth-library";
import type { GeneratedEvent } from "./gemini.ts";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Google Calendar only supports these 11 event colors (colorId -> hex).
const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#A4BDFC",
  "2": "#7AE7BF",
  "3": "#DBADFF",
  "4": "#FF887C",
  "5": "#FBD75B",
  "6": "#FFB878",
  "7": "#46D6DB",
  "8": "#E1E1E1",
  "9": "#5484ED",
  "10": "#51B749",
  "11": "#DC2127",
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Picks the closest Google Calendar colorId to an arbitrary hex color. */
export function nearestColorId(hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = "1";
  let bestDist = Infinity;
  for (const [id, h] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const [r2, g2, b2] = rgb(h);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T = unknown>(
  client: OAuth2Client,
  url: string,
  init: { method: string; body?: unknown },
): Promise<T | null> {
  // Throws if the refresh token was revoked/expired; surface that as a re-login prompt.
  const token = await client
    .getAccessToken()
    .then((r) => r.token)
    .catch(() => null);
  if (!token) throw new CalendarError("Google access expired. Visit /auth/google to log in again.", 401);
  const res = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    // 404/410 on delete just means the event is already gone.
    if (init.method === "DELETE" && (res.status === 404 || res.status === 410)) return null;
    const detail = await res.text().catch(() => "");
    throw new CalendarError(`Google Calendar API ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

// Events created by this app are tagged with a private extended property, so we can find
// them again later without keeping any copy of the calendar in our own database.
const APP_TAG = "dubx";

export type CalendarEvent = GeneratedEvent & {
  googleEventId: string;
  /** All-day events come back from Google with a date instead of a dateTime. */
  allDay: boolean;
};

export async function insertEvent(
  client: OAuth2Client,
  e: GeneratedEvent,
  timeZone: string,
): Promise<string> {
  const created = await call<{ id: string }>(client, BASE, {
    method: "POST",
    body: {
      summary: e.name,
      description: e.description,
      start: { dateTime: e.start.toISOString(), timeZone },
      end: { dateTime: e.stop.toISOString(), timeZone },
      colorId: nearestColorId(e.color),
      // Google only has 11 colors; keep the exact hex alongside the event.
      extendedProperties: { private: { [APP_TAG]: "1", color: e.color } },
    },
  });
  return created!.id;
}

/** Updates an existing event's title, description, times and color (other fields are kept). */
export async function patchEvent(
  client: OAuth2Client,
  googleEventId: string,
  e: GeneratedEvent,
  timeZone: string,
): Promise<void> {
  await call(client, `${BASE}/${encodeURIComponent(googleEventId)}`, {
    method: "PATCH",
    body: {
      summary: e.name,
      description: e.description,
      start: { dateTime: e.start.toISOString(), timeZone },
      end: { dateTime: e.stop.toISOString(), timeZone },
      colorId: nearestColorId(e.color),
      // PATCH merges nested objects, so this keeps any existing private properties.
      extendedProperties: { private: { color: e.color } },
    },
  });
}

export async function deleteEvent(client: OAuth2Client, googleEventId: string): Promise<void> {
  await call(client, `${BASE}/${encodeURIComponent(googleEventId)}`, { method: "DELETE" });
}

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const DEFAULT_COLOR = "#039BE5"; // Google's default calendar blue

const PAGE_SIZE = 250;
const MAX_UNSCOPED_EVENTS = 2500; // safety cap when listing the user's whole calendar

type ListOptions = {
  from?: Date;
  to?: Date;
  /** Only events this app created (found via the private tag), whoever the calendar owner is. */
  appOnly: boolean;
};

async function listEvents(client: OAuth2Client, opts: ListOptions): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: "true", // expand recurring events into individual instances
      orderBy: "startTime",
      maxResults: String(PAGE_SIZE),
    });
    if (opts.appOnly) params.set("privateExtendedProperty", `${APP_TAG}=1`);
    if (opts.from) params.set("timeMin", opts.from.toISOString());
    if (opts.to) params.set("timeMax", opts.to.toISOString());
    if (pageToken) params.set("pageToken", pageToken);

    const page = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      client,
      `${BASE}?${params}`,
      { method: "GET" },
    );
    for (const g of page?.items ?? []) {
      const start = g.start?.dateTime ?? g.start?.date;
      const stop = g.end?.dateTime ?? g.end?.date;
      if (g.status === "cancelled" || !start || !stop) continue;
      out.push({
        googleEventId: g.id,
        allDay: !g.start?.dateTime,
        name: g.summary ?? "(no title)",
        description: g.description ?? "",
        start: new Date(start),
        stop: new Date(stop),
        color:
          g.extendedProperties?.private?.color ??
          (g.colorId ? GOOGLE_EVENT_COLORS[g.colorId] : undefined) ??
          DEFAULT_COLOR,
      });
    }
    pageToken = page?.nextPageToken;
  } while (pageToken && (opts.appOnly || out.length < MAX_UNSCOPED_EVENTS));
  return out;
}

/** Every event on the user's primary calendar in the window, no matter who created it. */
export function listCalendarEvents(
  client: OAuth2Client,
  range: { from: Date; to: Date },
): Promise<CalendarEvent[]> {
  return listEvents(client, { ...range, appOnly: false });
}

/** Only the events this app created (used to replace or clear the generated schedule). */
export function listAppEvents(client: OAuth2Client): Promise<CalendarEvent[]> {
  return listEvents(client, { appOnly: true });
}

/** Runs `fn` over `items` with limited concurrency, preserving result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}
