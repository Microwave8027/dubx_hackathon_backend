# Linking Google Calendar

The Calendar page assumes the backend already does Google OAuth. The UI never sees Google
credentials or tokens; it only asks the backend for the link status and for a consent URL.
**These endpoints are assumed, not agreed.** Only `src/calendar/google.ts` knows them.

| Call                                         | Response                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /integrations/google-calendar`          | `{ "connected": boolean, "account": "me@example.com" }` (`account` optional)                     |
| `POST /integrations/google-calendar/connect` | `{ "authUrl": "https://accounts.google.com/..." }`, or `{ "connected": true }` if already linked |
| `DELETE /integrations/google-calendar`       | `204`, or `{ "connected": false }`                                                               |

The backend must allow `DELETE` in its CORS preflight (the mock did not and now does).

## Flow

1. Page loads and reads the status. Not connected: a "Connect Google Calendar" card.
2. The button calls `connect`. The UI opens `authUrl` in the **system browser** (desktop: the
   `open_external` Rust command, https only; web: a new tab). Anything that is not `https` is refused.
3. The UI polls the status every 2 seconds, for up to 2 minutes, until `connected` is true (there is
   also an "I've finished" button). Then it loads the calendar.
4. Disconnect asks for confirmation, then calls `DELETE`.

If the status endpoint is missing (a 404 or network error, for example before the backend is
integrated) the UI shows the calendar anyway from `GET /schedule` and hides Disconnect. Events come
from the existing data layer; see `docs/calendar-payload.md`.

## Not decided

- Where the browser lands after consent. Polling means the UI does not depend on a redirect back.
- Whether account email is available for display.
