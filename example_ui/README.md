# example_ui

A small server-rendered UI for checking that the Express backend's Google OAuth works end to end.
Built with **Axum** (server), **Leptos** (SSR components, rendered to HTML with no hydration or
WASM) and **htmx** (partial page updates, vendored in `static/`).

It shows three checks (backend reachable, Google OAuth session, Google Calendar fetched with the
user's OAuth token), the calendar as a list **and** as the raw JSON the backend returned, and lets
you store items through the backend:

- **Add an event** -> `POST /schedule/events` on the backend, which creates it in Google Calendar.
- **Generate with Gemini** -> `POST /schedule/generate`.
- **Clear app events** -> `DELETE /schedule`.

## Run it

1. Start the backend and set its `CLIENT_ORIGIN=http://localhost:8080` (the new default in the
   backend's `.env.example`), so the post-login redirect lands here.
2. From this directory: `cargo run`
3. Open **http://localhost:8080** (use `localhost`, not `127.0.0.1`) and click *Sign in with Google*.

Configuration is optional and read from the environment or a `.env` file (see `.env.example`).
Defaults: UI on `127.0.0.1:8080`, backend at `http://localhost:3000`.

## How auth works here

The browser signs in through the backend (`/auth/google`), and the backend sets its `connect.sid`
session cookie. Cookies aren't isolated by port, so the browser also sends that cookie to this
server on `localhost:8080`. For each request this server forwards the cookie to the backend, so
the backend treats every call as that Google user. Nothing is stored in this server.

This is a local verification tool: it relies on both servers sharing a hostname. In production,
put both behind one domain (or have the UI proxy `/auth`) instead.

## Routes

| Method | Path          | Returns |
| ------ | ------------- | ------- |
| GET    | `/`           | Full page |
| GET    | `/calendar`   | htmx fragment: the calendar panel |
| POST   | `/events`     | Panel fragment after adding an event |
| POST   | `/generate`   | Panel fragment after Gemini generation |
| POST   | `/clear`      | Panel fragment after deleting app events |
| POST   | `/logout`     | Redirect to `/`, clears the session cookie |

Failures from the backend (including an expired or revoked Google token) are shown in the page
with the backend's own error message.
