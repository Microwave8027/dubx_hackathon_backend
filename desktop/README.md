# Dubx desktop

Tauri v2 + React app for the Dubx backend. It shows your Google Calendar as an agenda, remembers
which apps belong to each block, and when a block starts it offers to close the previous block's
apps and open the new block's apps.

## Run

The app only works against a running backend, which normally runs in Docker:

1. **Start Docker Desktop.** The first time (and whenever the backend code changes), start the
   stack from `dubx_backend/` with `docker compose up -d --build`. After that, the containers start
   on their own whenever Docker Desktop opens (`restart: unless-stopped`).
2. **Run the app:**

   ```bash
   cd desktop
   bun install
   bun run tauri dev      # dev build with hot reload
   bun run tauri build    # installer in src-tauri/target/release/bundle/
   ```

Prerequisites: [Bun](https://bun.sh), Rust (MSVC toolchain on Windows), WebView2 (preinstalled on
Windows 11), and Docker Desktop.

Until `GET /health` on the backend (default `http://localhost:3000`; change it under **Server
settings**) answers with the API version this app needs, the app shows a screen for the specific
problem and re-checks every 3 seconds:

| Problem | Screen |
| ------- | ------ |
| Docker Desktop isn't running | **Open Docker Desktop** button |
| Docker is running but the backend doesn't answer | `docker compose up -d` |
| The container runs an old image (no desktop API) | `docker compose up -d --build` |

The same screen comes back whenever a request or the reminder stream can't connect (for example,
if Docker is stopped while the app is open), and the app continues once the backend is up.

## How it works

| Piece | Where |
| ----- | ----- |
| Sign-in: opens Google login in the system browser, receives a one-time code on a `127.0.0.1` loopback port, exchanges it with a PKCE verifier for a bearer token. Google blocks OAuth inside embedded webviews, so the login can't happen in the app window. | `src-tauri/src/auth.rs` |
| Token storage: Windows Credential Manager (Keychain / keyutils elsewhere), one entry per backend URL | `auth.rs` |
| Backend calls: the UI calls the `api` command; Rust adds the token, so it never reaches JavaScript. A 401 signs the app out. | `src-tauri/src/api.rs` |
| Reminders: listens to `GET /blocks/stream` (SSE), reconnects with backoff, shows a native notification, and raises the window for prompts that need an answer | `src-tauri/src/stream.rs` |
| Window snapshot: xcap lists windows; sysinfo adds exe paths; Win32 adds AppUserModelIDs for Store apps, restore geometry, and filters shell windows | `src-tauri/src/desktop/` |
| Closing: graceful `WM_CLOSE` on Windows (apps can still ask to save), `SIGTERM` elsewhere | `desktop/win32.rs` |
| Launching: exe path, or `shell:AppsFolder\<AUMID>` for Store/MSIX apps; new windows are moved back to their saved position with `SetWindowPlacement` | `desktop/mod.rs` |
| Tray: closing the window keeps Dubx running in the tray so reminders still arrive; tray menu has Open / Sync / Quit | `src-tauri/src/lib.rs` |

### The block lifecycle

1. **Sync.** On start, every 10 minutes, after any edit, and from the tray, the app calls
   `POST /blocks/sync` for today through 14 days ahead. New calendar events get an empty window group.
2. **Coming up** (`block_upcoming`, 5 minutes before by default). If the block has no windows, the
   app takes a snapshot of every open app (name, title, PID, exe) and asks which ones belong to the
   block. The ones you tick are saved with `PUT /blocks/:id/windows`.
3. **Starting** (`block_started`). A native notification appears and the app asks to switch:
   - **Close:** open windows that match the previous workspace's saved apps but not the new block's.
   - **Open:** the new block's saved apps that aren't running yet (one launch per app).
   - **Move back into place:** saved apps that are already open go back to their saved position
     and size and come to the front (`SetWindowPlacement`).
   - The block becomes the *active workspace*. It's remembered locally so the next switch knows what to close.

Saved apps match open windows by executable path, or by app name when no path was captured. UWP
apps (Settings, Calculator) share `ApplicationFrameHost.exe`, so they match by title and can't be
reopened automatically. Windows of elevated apps can be listed but their exe path can't be read.

### Screens

- **Dashboard:** the current block and which of its saved windows are open, upcoming blocks and
  the apps they'll open, and other open windows.
- **Agenda:** blocks grouped by day with their windows; create, edit, delete events; capture,
  re-capture, or clear a block's windows.
- **Configs:** save the windows you have open right now as a named configuration (all are
  ticked; untick what you don't want). **Load** one any time; it uses the same switch as blocks
  (closes the previous workspace's apps, opens the config's, becomes the active workspace).
  Apps that are already open are moved back to their saved position and size and brought to
  the front. An opt-in checkbox also closes every other open window.
  **Use for a block** copies its windows onto a calendar block. Edit renames it or replaces its
  windows with what's open now; Delete removes it. The "Choose windows" prompt for a block can also
  fill it from a saved configuration.
- **Assistant:** describe a change in plain language. Gemini proposes add/change/remove
  operations, you untick any you don't want, and only then are they applied.

## Tests

The native window code has an opt-in test that opens and closes real windows (Character Map and
Calculator):

```bash
cd src-tauri
cargo test --lib -- --ignored --nocapture
```
