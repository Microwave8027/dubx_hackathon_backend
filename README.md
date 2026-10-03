# dubx_backend

Express + MongoDB backend with Google OAuth. Users log in with Google, and Gemini builds a
personalized schedule from a POST body and creates it in their Google Calendar.

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

## Docker

```bash
docker compose up -d --build
```

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
| GET    | `/auth/google`          | Starts Google login (browser redirect). Creates the user record on first login. |
| GET    | `/auth/google/callback` | OAuth callback; sets the session cookie and redirects to `CLIENT_ORIGIN`. |
| GET    | `/auth/me`              | Current user profile. |
| POST   | `/auth/logout`          | Ends the session. |
| GET    | `/schedule`             | Every event on the user's primary Google Calendar, whoever created it. Default window: last 7 days to next 30 days; override with `?from=<ISO>&to=<ISO>`. |
| POST   | `/schedule/events`      | Creates one event directly (`name`, `start`, `stop`, optional `description`, `color`, `timeZone`). |
| DELETE | `/schedule`             | Deletes every event this app created. |
| POST   | `/schedule/generate`    | Gemini builds a schedule from the JSON body, creates it in Google Calendar, replaces the previous schedule, returns the new one. |
| GET    | `/health`               | Liveness check. |

All `/schedule` routes require the session cookie (send requests with credentials).

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

## Notes

- No calendar data is stored in MongoDB. `GET /schedule` reads live from the user's primary
  Google Calendar and returns every event in the window (recurring events are expanded; cancelled
  ones are skipped; all-day events come back as midnight UTC; at most 2500 events). Events without
  a title are named "(no title)".
- Events created by this app are tagged with a private extended property (`dubx=1`). That tag is
  only used by `POST /schedule/generate` (to replace the previous generated schedule, after the new
  one was created successfully) and `DELETE /schedule`. Events the user created themselves are
  never modified or deleted.
- Google Calendar supports only 11 event colors, so the event uses the closest one; the exact
  hex is kept in the event's private extended properties and returned by the API.
- MongoDB holds only the `User` record (Google id, profile, OAuth tokens) and login sessions.
  Tokens are hidden from queries by default; encrypt them at rest before deploying to production.
- Set `NODE_ENV=production` behind HTTPS so the session cookie is `secure`.
