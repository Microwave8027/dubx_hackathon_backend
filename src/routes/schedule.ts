import { Router, type Response } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { clientForUser } from "../google.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import {
  CalendarError,
  deleteEvent,
  insertEvent,
  listAppEvents,
  listCalendarEvents,
  mapLimit,
} from "../services/calendar.ts";
import { GeminiError, generateSchedule, type GeneratedEvent } from "../services/gemini.ts";

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

type EventLike = {
  name: string;
  description?: string | null;
  start: Date;
  stop: Date;
  color: string;
};

/** Public shape of a calendar entry. */
function serialize(e: EventLike) {
  return {
    start: e.start.toISOString(),
    stop: e.stop.toISOString(),
    color: e.color,
    description: e.description ?? "",
    name: e.name,
  };
}

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_BACK = 7;
const DEFAULT_DAYS_AHEAD = 30;

/** Maps Google API failures to an HTTP response (401 = token revoked/expired, else 502). */
function sendCalendarError(res: Response, err: CalendarError) {
  res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
}

const NOT_CONNECTED = "Google account not connected. Visit /auth/google to log in.";

// GET /schedule[?from=ISO&to=ISO]
// Every event on the user's primary Google Calendar in the window, whoever created it, read live.
// Default window: the last 7 days through the next 30 days.
scheduleRouter.get("/", async (req, res) => {
  const q = rangeQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: "from/to must be valid dates" });
    return;
  }
  const from = q.data.from ?? new Date(Date.now() - DEFAULT_DAYS_BACK * DAY_MS);
  const to = q.data.to ?? new Date(from.getTime() + DEFAULT_DAYS_AHEAD * DAY_MS);
  if (to <= from) {
    res.status(400).json({ error: "to must be after from" });
    return;
  }

  const client = await clientForUser(req.session.userId!);
  if (!client) {
    res.status(401).json({ error: NOT_CONNECTED });
    return;
  }
  try {
    res.json((await listCalendarEvents(client, { from, to })).map(serialize));
  } catch (err) {
    if (err instanceof CalendarError) return sendCalendarError(res, err);
    throw err;
  }
});

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const newEventBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).default(""),
    start: z.coerce.date(),
    stop: z.coerce.date(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "color must be #RRGGBB")
      .default("#039BE5"),
    timeZone: z.string().refine(isValidTimeZone, "invalid IANA time zone").optional(),
  })
  .refine((e) => e.stop > e.start, { message: "stop must be after start", path: ["stop"] });

// POST /schedule/events -> create one event directly (no Gemini), stored only in Google Calendar
scheduleRouter.post("/events", async (req, res) => {
  const parsed = newEventBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message}` });
    return;
  }
  const { timeZone, ...event } = parsed.data;
  const client = await clientForUser(req.session.userId!);
  if (!client) {
    res.status(401).json({ error: NOT_CONNECTED });
    return;
  }
  try {
    await insertEvent(
      client,
      { ...event, color: event.color.toUpperCase() },
      timeZone ?? config.DEFAULT_TIME_ZONE,
    );
  } catch (err) {
    if (err instanceof CalendarError) return sendCalendarError(res, err);
    throw err;
  }
  res.status(201).json(serialize({ ...event, color: event.color.toUpperCase() }));
});

// DELETE /schedule -> remove every event this app created (the user's own events are untouched)
scheduleRouter.delete("/", async (req, res) => {
  const client = await clientForUser(req.session.userId!);
  if (!client) {
    res.status(401).json({ error: NOT_CONNECTED });
    return;
  }
  try {
    const events = await listAppEvents(client);
    await mapLimit(events, 5, (e) => deleteEvent(client, e.googleEventId));
  } catch (err) {
    if (err instanceof CalendarError) return sendCalendarError(res, err);
    throw err;
  }
  res.status(204).end();
});

// POST /schedule/generate  (any JSON body describing what you want)
// Asks Gemini to build a calendar from the body, creates the events in the user's
// Google Calendar, replaces the events this app created earlier, and returns the new schedule.
// Nothing is stored in our database; Google Calendar is the only copy.
scheduleRouter.post("/generate", async (req, res) => {
  const body: unknown = req.body;
  const isEmpty =
    body == null ||
    (typeof body === "object" && Object.keys(body).length === 0) ||
    (typeof body === "string" && body.trim() === "");
  if (isEmpty) {
    res.status(400).json({ error: "Request body must describe the schedule you want" });
    return;
  }

  const bodyTz = (body as { timeZone?: unknown }).timeZone;
  if (bodyTz !== undefined && !isValidTimeZone(bodyTz)) {
    res
      .status(400)
      .json({ error: "timeZone must be a valid IANA time zone, e.g. America/New_York" });
    return;
  }
  const timeZone = bodyTz ?? config.DEFAULT_TIME_ZONE;

  const userId = req.session.userId!;
  const client = await clientForUser(userId);
  if (!client) {
    res.status(401).json({ error: NOT_CONNECTED });
    return;
  }

  // 1. Generate first, so a Gemini failure never touches the existing calendar.
  let generated: GeneratedEvent[];
  try {
    generated = await generateSchedule(body, timeZone);
  } catch (err) {
    if (err instanceof GeminiError) {
      res.status(502).json({ error: err.message });
      return;
    }
    throw err;
  }

  // 2. Create the new events in Google Calendar (collecting results so we can roll back).
  let previous;
  try {
    previous = await listAppEvents(client);
  } catch (err) {
    if (err instanceof CalendarError) return sendCalendarError(res, err);
    throw err;
  }
  const results = await mapLimit(generated, 5, async (e) => {
    try {
      return { id: await insertEvent(client, e, timeZone), error: null };
    } catch (error) {
      return { id: null, error: error as Error };
    }
  });
  const failure = results.find((r) => r.error);
  if (failure) {
    await Promise.allSettled(results.filter((r) => r.id).map((r) => deleteEvent(client, r.id!)));
    if (failure.error instanceof CalendarError) return sendCalendarError(res, failure.error);
    throw failure.error;
  }

  // 3. Remove the previously generated events. Best effort: a stale event left behind
  // shouldn't fail a request whose new schedule was created successfully.
  await Promise.allSettled(previous.map((o) => deleteEvent(client, o.googleEventId)));

  res.status(201).json(generated.map(serialize));
});
