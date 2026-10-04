# Assistant (query the AI about your calendar)

The Assistant page sends a plain-English request to the backend, where Gemini reads your calendar
and **proposes** edits. You review them, untick any you do not want, and only then are they applied.
It uses two routes that already exist in this repo's backend (`src/routes/schedule.ts`).

## Flow

1. You type what you want (up to 4000 characters), for example "Clear my Friday afternoon".
2. `POST /schedule/assist` with `{ prompt, timeZone }` (the browser's IANA zone). Read-only.
   Response: `{ summary, warnings[], operations[] }`.
3. The page lists each operation as **Add**, **Change** or **Remove** (words, not just colours),
   with the explanation, and for changes and removals the original event from your calendar.
   Every change starts ticked.
4. **Apply N changes** sends only the ticked operations to `POST /schedule/batch` with
   `{ timeZone, operations }`. The response has a result per operation; failures are reported
   (`2 applied, 1 failed: …`) and the proposal stays on screen. When everything succeeds the
   proposal and the prompt clear and the calendar refreshes.
5. **Discard** drops the proposal without touching anything.

An operation is one of:

```json
{ "op": "create", "name": "Deep work", "start": "ISO", "stop": "ISO", "description": "", "color": "#039BE5" }
{ "op": "update", "id": "<google event id>", "name": "...", "start": "ISO", "stop": "ISO" }
{ "op": "delete", "id": "<google event id>" }
```

## Signing in

The backend authenticates with Google login and a session cookie (or a bearer token). The
UI sends cookies (`credentials: 'include'`), and the backend's CORS must allow the app's origin
with credentials (`CLIENT_ORIGIN`, already set up that way). A `401` shows **Sign in with
Google**, a link to `{API URL}/auth/google`. After signing in, **I've signed in, try again** repeats
the request.

## Calendar field names

The backend's `GET /schedule` names events `name` and `stop` (and `id`). The calendar normalizer
(`src/calendar/normalize.ts`) now reads those as the title and end, as well as `title` and `end`.

## Local development

`pnpm dev:mock` serves fake `/schedule/assist` and `/schedule/batch` (`mock/assistant.js`) that
follow a few keyword rules so the demo is predictable (this is not an AI): "add …" creates a focus
block tomorrow, "move …" shifts the next event an hour, "clear …" removes the next two, "no
changes" proposes nothing, "overlap" adds a warning, "fail" makes one operation fail, and
"gemini-error" returns a `502`. Applied edits show up in `GET /schedule`.
`POST /__mock/assistant?signedIn=false` makes the mock answer `401`.

## Limits and not yet done

- **Not tested against the real backend**: it needs MongoDB, Google OAuth credentials and a Gemini
  key. The request and response shapes were taken from `src/routes/schedule.ts`.
- **The desktop (Tauri) app cannot sign in this way yet.** Its origin (`tauri://localhost`) is
  a different site from the backend, so the session cookie is not sent. The old desktop client used a
  PKCE flow ending in a bearer token (`POST /auth/desktop/token`); this UI does not have that yet.
  In a browser or the installed PWA on the same site as the backend (for example both on
  `localhost`), the cookie works.
- Only the primary Google calendar is read or changed, as in the backend.
