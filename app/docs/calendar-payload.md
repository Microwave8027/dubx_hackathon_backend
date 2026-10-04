# Calendar payload

The UI reads the schedule as a JSON dataset. The exact field names are not final, so the UI is
tolerant, and **only `src/calendar/normalize.ts` knows the shape**. If the Rust output changes,
edit that file and its tests (`src/calendar/normalize.test.ts`, fixtures in `fixtures/calendar/`).
The UI never calls Google and never sees tokens.

## Transport

| Path                                             | How                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP (default, and the only path the phone uses) | `GET {VITE_API_URL}/schedule`                                                                                                                        |
| Desktop only, `VITE_CALENDAR_SOURCE=tauri`       | `invoke("get_calendar_json")` (TODO: the command name is a placeholder in `src/calendar/source.ts`; it may return the object or a JSON string)       |
| Push                                             | WebSocket `calendar.snapshot` with the payload as `data` (written straight into the cache), or `calendar.updated` with no payload (the UI refetches) |

`GET /schedule` may take optional `?from=&to=` (ISO instants), but **the UI does not depend on
them**: return your whole window (for example the next 30 days) and the client filters to the
visible range itself. The UI also refetches every 5 minutes while the tab is visible and on focus.

The daemon does **not** need to send a computed state; the UI derives
ended / active / in progress / starting soon / deferred / upcoming itself.

## Expected shape

```json
{
  "timezone": "America/Los_Angeles",
  "fetchedAt": "2026-10-03T18:00:00Z",
  "events": [
    {
      "id": "evt_1",
      "title": "Math homework",
      "start": "2026-10-03T15:00:00-07:00",
      "end": "2026-10-03T16:15:00-07:00",
      "allDay": false,
      "calendar": "School",
      "color": "#4285f4",
      "location": null,
      "description": null,
      "status": "confirmed"
    },
    {
      "id": "evt_2",
      "title": "English homework",
      "start": "2026-10-03T17:00:00-07:00",
      "end": "2026-10-03T18:00:00-07:00",
      "calendar": "School",
      "description": "Essay draft https://docs.google.com/document/d/example",
      "status": "tentative"
    },
    {
      "id": "evt_3",
      "title": "Spirit Week",
      "start": "2026-10-05",
      "end": "2026-10-06",
      "allDay": true,
      "calendar": "School"
    }
  ]
}
```

A top-level array of events is accepted too. Unknown fields are ignored.

## What the normalizer accepts

| Field        | Accepted names / forms                                               |
| ------------ | -------------------------------------------------------------------- |
| title        | `title`, `summary` (missing: shown as "(No title)")                  |
| calendar     | `calendar`, `calendarName`, `calendar_name`                          |
| all-day flag | `allDay`, `all_day` (or inferred from a date-only start)             |
| start        | `start`, `startTime`, `start_time`                                   |
| end          | `end`, `endTime`, `end_time`                                         |
| status       | `confirmed`, `tentative`, `cancelled` / `canceled`                   |
| other        | `id`, `color` (hex), `location`, `description` (`null` means absent) |

### Times

- ISO 8601 with an offset or `Z`.
- Google style: `{ "dateTime": "...", "timeZone": "..." }` or `{ "date": "YYYY-MM-DD" }`.
- Epoch seconds or milliseconds (numbers or numeric strings). Values below `1e12` are seconds.
- A **naive** datetime (no offset) is read in the dataset's `timezone` if present (an event's own
  `timeZone` wins for Google style), otherwise in the user's local zone.
- A **date-only** value (`YYYY-MM-DD`) means an all-day event and is a **local date**, never shifted
  through UTC. An all-day `end` is **exclusive** (the day after the last day); a missing one means
  one day.

### Rules

- Missing `id`: a stable one is derived from title + start. Duplicate ids: the first one wins.
- Missing `end` on a timed event: start + 60 minutes. `end` before `start`: the event is dropped.
- `cancelled` events are dropped (not counted as errors).
- Invalid events are dropped and counted. The UI logs **one** `console.warn` per load and, in dev,
  shows an "N events skipped" badge. One bad event never hides the rest.
- An unusable top-level payload (not an array and no `events` array) is an error state.

## Mock and demo

`pnpm dev:mock` serves this shape at `GET /schedule` with times generated relative to now (always a
current and an upcoming event). `?demo=calendar-full` serves about 30 days of events;
`?demo=calendar-bad` serves a messy payload (cancelled and invalid events, aliases, Google-style and
epoch times) to exercise the skip badge and error handling. The mock pushes `calendar.snapshot`
(with payload) and `calendar.updated` (without) on a timer.
