# dubx_backend

Express + MongoDB backend with Google OAuth. Users log in with Google, and Gemini builds a
personalized schedule from a POST body and creates it in their Google Calendar. It also backs the
[desktop app](desktop/README.md): every calendar block gets a group of saved windows, and a
the app is told when blocks are coming up or starting.

## Setup

1. `bun install`
2. Start MongoDB (e.g. `docker run -d -p 27017:27017 mongo:7`).
3. Fill in `.env` (template: `.env.example`):
   - `GEMINI_API_KEY` — from https://aistudio.google.com/apikey
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console → APIs & Services →
     Credentials → OAuth client ID (Web application). Add `GOOGLE_REDIRECT_URI`
     (default `http://localhost:3000/auth/google/callback`) as an authorized redirect URI, and
     enable the **Google Calendar API** for the project.
   - `SESSION_SECRET` — any long random string.
4. `bun run dev` (or `bun start`)

## Deploy on Vercel

`app.ts` (project root) default-exports the Express app, which Vercel detects and runs as a
function; `vercel.json` selects the Bun runtime (matching `bun.lock`). `local.ts` is the
long-running entry point used by `bun run dev` and Docker. The server keeps no state in memory:
MongoDB is connected on first request and cached, sessions live in MongoDB, and reminders are
computed per request (see *Reminders*).

1. **Database:** use MongoDB Atlas (Vercel can't run a database). Allow connections from anywhere
   (`0.0.0.0/0`) in Atlas Network Access, since function IPs aren't fixed. Put the database in the
   region your functions run in.
2. **Import the repo** at vercel.com/new (or run `bunx vercel`). Leave the framework as detected;
   the root directory is this folder.
3. **Environment variables** (Project Settings, Environment Variables): everything in
   `.env.example`, with these production values:
   - `NODE_ENV=production` (Vercel sets it) makes session cookies `secure`.
   - `MONGODB_URI` is your Atlas connection string.
   - `GOOGLE_REDIRECT_URI=https://<your-domain>/auth/google/callback`.
   - `SESSION_SECRET` is a long random string. Don't reuse your local one.
4. **Google Cloud Console:** add that same redirect URI to the OAuth client's authorized redirect URIs.
5. **Check:** `https://<your-domain>/health` returns `{ "ok": true, "api": 4 }`.
6. **Desktop app:** build it with your URL as the default, or set it under *Server settings*:
   `DUBX_BACKEND_URL=https://<your-domain> bun run tauri build` (in `desktop/`).

Notes: Vercel's Bun runtime is in beta. Calendar sync and Gemini calls run inside one request, so
they must finish within your plan's function duration limit (all default plans allow 60s+).

## Docker (local or self-hosted)

```bash
docker compose up -d --build
```

For running the whole stack locally: start Docker Desktop, then the desktop app (which defaults
to `http://localhost:3000`). Rebuild with `--build` after pulling backend changes, or the app will
report an outdated backend.

Runs the app plus its own MongoDB (data in the `mongo-data` volume, not exposed to the host).
It reads secrets from `.env` and points `MONGODB_URI` at the bundled Mongo automatically. The
app listens on `PORT` (default 3000). To use an external database (e.g. Atlas) instead, run
just the image: `docker build -t dubx_backend .` then
`docker run --env-file .env -p 3000:3000 dubx_backend` with `MONGODB_URI` set in `.env`.

The image sets `NODE_ENV=production`, so session cookies are `secure` and browsers only keep
them over HTTPS. Put the container behind a TLS-terminating proxy (Caddy, nginx, a cloud load
balancer) that forwards `X-Forwarded-Proto`. To try it over plain `http://localhost`, add
`COOKIE_SECURE=false` to `.env`. In production, set `GOOGLE_REDIRECT_URI` and `CLIENT_ORIGIN`
to your public URLs and register the redirect URI in Google Cloud Console.

## Routes

| Method | Path                    | Description |
| ------ | ----------------------- | ----------- |
| GET    | `/auth/google`          | Starts Google login (browser redirect). Creates the user record on first login. With `?port=&state=&challenge=` it's a desktop login (see below). |
| POST   | `/auth/desktop/token`   | Desktop app: exchanges `{ code, verifier, deviceName? }` for `{ token, user }`. |
| GET    | `/auth/google/callback` | OAuth callback; sets the session cookie and redirects to `CLIENT_ORIGIN`. |
| GET    | `/auth/me`              | Current user profile. |
| POST   | `/auth/logout`          | Ends the session, or revokes the bearer token it was sent with. |
| GET    | `/schedule`             | Every event on the user's primary Google Calendar, whoever created it. Default window: last 7 days to next 30 days; override with `?from=<ISO>&to=<ISO>`. |
| POST   | `/schedule/events`      | Creates one event directly (`name`, `start`, `stop`, optional `description`, `color`, `timeZone`). Returns it with its `id`. |
| PUT    | `/schedule/events/:id`  | Replaces an event's name, description, times and color (same body as POST). Other fields such as attendees are kept. |
| DELETE | `/schedule/events/:id`  | Deletes one event. |
| POST   | `/schedule/assist`      | `{ prompt, timeZone?, from?, to? }`: Gemini reads the calendar and **proposes** `create`/`update`/`delete` operations. Nothing is changed. |
| POST   | `/schedule/batch`       | `{ timeZone?, operations }`: applies operations (e.g. an accepted proposal); returns a result per operation. |
| DELETE | `/schedule`             | Deletes every event this app created. |
| POST   | `/schedule/generate`    | Gemini builds a schedule from the JSON body, creates it in Google Calendar, replaces the previous schedule, returns the new one. |
| GET    | `/blocks`               | Stored blocks (calendar events + their windows), sorted by start. Default: not yet ended. `?from=&to=` window, `?empty=true` only blocks with no windows. |
| POST   | `/blocks/sync`          | Syncs blocks with Google Calendar (body `{ from?, to? }`, default now → `SYNC_DAYS_AHEAD` days). |
| GET    | `/blocks/due`           | `?since=<ISO>`: reminder prompts that fell due since the last check (the desktop app polls this every 10s). |
| GET    | `/blocks/upcoming`      | Peek at blocks starting in the next `?within=` minutes (default `REMINDER_LEAD_MINUTES`). |
| DELETE | `/blocks`               | Deletes all the user's blocks, or with `?before=<ISO>` only those that ended before it. |
| GET    | `/blocks/:id`           | One block. |
| DELETE | `/blocks/:id`           | Deletes a block and its windows (the calendar event is untouched). |
| PUT    | `/blocks/:id/windows`   | Replaces the block's window group: `{ "windows": [ ... ] }`. |
| POST   | `/blocks/:id/windows`   | Appends one window. |
| DELETE | `/blocks/:id/windows`   | Empties the window group. |
| DELETE | `/blocks/:id/windows/:windowId` | Removes one window. |
| GET    | `/configs`              | Saved configurations (named window sets), most recently used first. |
| POST   | `/configs`              | `{ name, description?, windows }`: saves a configuration. Names are unique per user (case-insensitive). |
| GET    | `/configs/:id`          | One configuration. |
| PUT    | `/configs/:id`          | `{ name?, description?, windows? }`: renames it and/or replaces its windows. |
| POST   | `/configs/:id/used`     | Marks it as just loaded (for sorting). |
| DELETE | `/configs/:id`          | Deletes it. Blocks that copied its windows keep them. |
| GET    | `/health`               | Liveness check: `{ ok: true, api: 4 }`. The desktop app uses `api` to detect an outdated backend. |

All `/schedule`, `/blocks` and `/configs` routes require the session cookie (send requests with credentials)
or `Authorization: Bearer <token>` from the desktop login.

### Desktop login

Google doesn't allow OAuth inside embedded webviews, so the desktop app logs in through the system
browser, following the native-app OAuth flow (RFC 8252):

1. The app listens on `127.0.0.1:<port>` and opens
   `/auth/google?port=<port>&state=<random>&challenge=<base64url(sha256(verifier))>`.
2. After Google login, the backend redirects to `http://127.0.0.1:<port>/callback?code=...&state=...`.
   The code is single-use and valid for 2 minutes.
3. The app calls `POST /auth/desktop/token` with the code and its PKCE `verifier` and gets a bearer
   token. Tokens are stored hashed (`ApiToken` collection) and expire after 90 days without use.

### Schedule format

```json
[
  {
    "start": "2026-10-05T14:00:00.000Z",
    "stop": "2026-10-05T15:00:00.000Z",
    "color": "#4285F4",
    "description": "Upper body strength session",
    "name": "Gym"
  }
]
```

Timestamps are ISO 8601 in UTC; `color` is `#RRGGBB`.

### Generating a schedule

The body is free-form JSON that describes what you want. `timeZone` (IANA name, e.g.
`America/New_York`) is the only field with special meaning; it falls back to `DEFAULT_TIME_ZONE`.

```bash
curl -X POST http://localhost:3000/schedule/generate \
  -H "Content-Type: application/json" --cookie "connect.sid=..." \
  -d '{
    "timeZone": "America/New_York",
    "goals": ["gym 3x a week", "study for the MCAT 2h/day"],
    "constraints": "work 9-5 Mon-Fri",
    "weeks": 1
  }'
```

## Blocks and windows

Every timed event on the user's primary calendar (each instance of a recurring event; all-day
events are skipped) gets a **block** in MongoDB that holds its own group of desktop windows. The
desktop (Tauri) app captures windows with xcap and saves them with `PUT /blocks/:id/windows`:

```json
{
  "windows": [
    {
      "pid": 4242,
      "appName": "Code",
      "title": "dubx - Visual Studio Code",
      "exePath": "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      "args": [],
      "x": 0, "y": 0, "width": 1920, "height": 1080,
      "isMinimized": false, "isMaximized": true,
      "monitor": "\\\\.\\DISPLAY1"
    }
  ]
}
```

Only `pid` and `appName` are required. PIDs change every launch, so send `exePath` (resolve it
from the PID on the desktop side) if you want to relaunch the app later. Packaged Windows (Store)
apps also send `aumid`, their AppUserModelID, which is how they're relaunched. A block holds at most 100
windows.

**Sync** (`POST /blocks/sync`) reads the live calendar for the window and makes the stored blocks
match it:

- new event → new block with an empty window group
- event whose name, start or stop changed → old block deleted, new empty block created
- event removed from the calendar → block deleted
- description/color change only → updated in place, windows kept
- blocks outside the window are left alone

The response is `{ added, replaced, removed, unchanged, blocks }`.

**Reminders.** There is no scheduler process and no held-open connection: every call to
`GET /blocks/due?since=<ISO>` works out, from the stored blocks, which prompts fell due since the
client's last check, so any server instance can answer it. The desktop app polls every 10 seconds
and passes the `now` from the previous response as `since`.

- `upcoming`: `REMINDER_LEAD_MINUTES` before a block starts. Also sent right away for a block
  created or synced inside its lead window.
- `started`: when the block's start time passes.

```json
{ "now": "2026-10-05T13:55:02.114Z",
  "prompts": [ { "kind": "upcoming", "needsWindows": true, "message": "\"Gym\" starts in 5 minutes. No windows are saved for it yet. Save your current windows?", "block": { } } ] }
```

`needsWindows: true` means the app should ask the user to save their current windows. On `started`
with saved windows, the app should open them. Without `since`, blocks already inside their lead
window are returned. Prompts older than 10 minutes are dropped (e.g. after the laptop slept).

## Notes

- `/schedule` stores no calendar data. `GET /schedule` reads live from the user's primary
  Google Calendar and returns every event in the window (recurring events are expanded; cancelled
  ones are skipped; all-day events come back as midnight UTC; at most 2500 events). Events without
  a title are named "(no title)".
- Events created by this app are tagged with a private extended property (`dubx=1`). That tag is
  only used by `POST /schedule/generate` (to replace the previous generated schedule, after the new
  one was created successfully) and `DELETE /schedule`; those two never touch events the user
  created themselves. The per-event routes (`PUT`/`DELETE /schedule/events/:id`) and
  `/schedule/batch` act on whichever event the client names.
- Google Calendar supports only 11 event colors, so the event uses the closest one; the exact
  hex is kept in the event's private extended properties and returned by the API.
- Configurations (`configs` collection) are named window sets that aren't tied to the calendar; the
  desktop app loads them on demand or copies one onto a block. They use the same window shape as blocks.
- Apart from blocks, configurations and hashed desktop tokens, MongoDB
  holds only the `User` record (Google id, profile, OAuth tokens) and login sessions.
  Tokens are hidden from queries by default; encrypt them at rest before deploying to production.
- Set `NODE_ENV=production` behind HTTPS so the session cookie is `secure`.
