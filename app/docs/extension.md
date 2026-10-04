# Chrome extension: tab sync

When you save your config in the app, every browser where you installed the extension sends its
open tabs to your account. This file covers installing it, pairing it, testing it with two Chrome
profiles, and the API contract the backend has to implement.

## How it works

```
 Save config (app) ──► server creates a sync request {userId, configId, requestId, createdAt}
        │
        ├─ same browser:  page ── chrome.runtime.sendMessage(extensionId, {type:"check-now"}) ──► extension captures now
        └─ other browsers: extension polls GET /api/extension/pending every 30 s (chrome.alarms)
                                     │
   extension: chrome.tabs.query({}) ──► POST /api/tab-snapshots  (Bearer token, retried and queued if it fails)
```

- The instant path only works where Chrome lets the page message the extension (the app served from
  the origin the extension was built for). Everywhere else, including the desktop app and other
  browsers, the 30-second poll does the job.
- The extension asks the server which requests _this device_ has not answered, and also remembers
  what it handled, so a request is never answered twice. The server's unique key
  `(userId, requestId, deviceId)` makes a retried POST harmless.

## Build and install (Chrome 120+)

```bash
cd dubx-app
pnpm install
pnpm ext:build                     # -> extension/dist, for http://localhost:1420
# For a deployed app, trust that origin instead:
APP_ORIGIN=https://app.example.com pnpm ext:build
```

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** and choose `dubx-app/extension/dist`.
3. The extension opens its Settings page with a consent note. Incognito access stays off (the
   manifest sets `"incognito": "not_allowed"`, and incognito tabs are skipped anyway).

The extension id is fixed (`dkalbkpfkomiienoddgbkngihfhbjinp`) because the manifest carries the
public key it is derived from. The app and the mock server know it; override with
`VITE_EXTENSION_ID` (app) and `MOCK_EXTENSION_ID` (mock) if you publish under another id.

## Pair it with your account

1. In the app, open **Settings → Connect extension** and press **Generate token**. The token is
   shown once; the server stores only its SHA-256 hash. Copy it (and the API URL shown below it).
2. In the extension's Settings page: accept the consent note, paste the **API base URL** and the
   **token**, name the device, press **Save**, then **Test connection** (shows "Connected as …").
3. The popup shows connected or not, the last snapshot time, and a **Sync now** button.

Revoke a token from the same section of the app. That browser stops syncing and shows
"The token was rejected" in its status.

## Try it with two Chrome profiles

```bash
pnpm dev:mock            # app on :1420, mock API on :8787
pnpm ext:build
```

1. Open two Chrome profiles (profile menu, **Add**). In each, load `extension/dist` unpacked.
2. In profile A open the app at `http://localhost:1420/settings`, generate a token. Pair **both**
   profiles with the same token and `http://localhost:8787` as the API URL. Open a few different
   tabs in each profile.
3. In profile A change a setting (for example the briefing time) and press **Save changes**.
4. Profile A sends its tabs within a second (instant path). Profile B sends within 30 seconds
   (poll), or press **Sync now** in its popup.
5. See what arrived: `curl http://localhost:8787/__mock/extension/snapshots`. There is one entry per
   device, with the same `requestId`, different `deviceId`s and only `http(s)` tabs.

Automated: `pnpm exec playwright test e2e/extension.spec.ts` launches real Chromium with the built
extension (two profiles, polling, idempotency, consent, revoked token), and
`pnpm exec vitest run extension mock` runs the unit and API tests.

## What is and is not captured

`chrome.tabs.query({})` across all windows. Only `http:` and `https:` tabs are kept, which excludes
`chrome://`, `chrome-extension://`, `about:`, `file://`, `devtools:`, `view-source:`, `data:` and
anything else. Incognito tabs are never captured. A snapshot holds at most 500 tabs (extras are
dropped and the status says how many), titles are cut at 1024 characters and URLs over 2048 are left out.

Failed posts (network, 5xx, 429) are queued in `chrome.storage.local` with backoff (30 s, 1 m, 2 m
… up to 30 m), at most 20 snapshots, oldest dropped first. A rejected token stops everything with
a clear message; a snapshot the server will never accept (400, 413) is not retried.

Permissions: `tabs`, `storage`, `alarms`, and a host permission only for the app origin.

## API contract (for the backend)

The dev mock (`mock/extension.js`, tests in `mock/extension.test.ts`) implements this in memory.
The real backend must follow the same behaviour. Paths and field names are as the extension uses them.

### Save creates a sync request

On a successful config save (today `PUT /profile`) insert into `sync_requests`:
`{ userId, configId, requestId: uuid, createdAt }`. The app does not send these ids.

### Extension endpoints (Bearer token, never the session cookie)

All of them return `401` for a missing, unknown or revoked token. CORS: answer **only** the origin
`chrome-extension://<extension id>` (`Access-Control-Allow-Origin` set to exactly that, `Vary: Origin`,
no wildcard, no credentials, allow headers `Authorization, Content-Type`). Any other `Origin` gets
`403`, including the preflight.

| Call                                  | Success                                                                                                                                     | Errors                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/extension/me`               | `200 { userId }`                                                                                                                            | `401`                                                                                                            |
| `GET /api/extension/pending?deviceId` | `200 { requests: [{ requestId, configId, createdAt }] }`, newest first, max 10, last 7 days, only those this `deviceId` has no snapshot for | `400` bad or missing `deviceId`, `401`                                                                           |
| `POST /api/tab-snapshots`             | `201 { ok: true, duplicate: false }`, or `200 { ok: true, duplicate: true }` for a repeat                                                   | `400` invalid body, `404` unknown `requestId`, `413` body over 1 MB, `422` `configId` does not match the request |

`POST /api/tab-snapshots` body (validate with zod; cap the body at 1 MB):

```json
{
  "requestId": "uuid",
  "configId": "string, 1 to 200",
  "deviceId": "uuid",
  "deviceName": "string, 1 to 100",
  "capturedAt": "ISO 8601 datetime",
  "tabs": [
    {
      "url": "http(s) url, max 2048",
      "title": "max 1024",
      "windowId": 0,
      "index": 0,
      "pinned": false,
      "groupId": -1
    }
  ]
}
```

`tabs` has at most 500 entries. A repeat for the same `(userId, requestId, deviceId)` stores
nothing new and returns `duplicate: true`.

### Token endpoints (the signed-in app, authenticated however the app is)

| Call                               | Result                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/extension/tokens`       | `201 { id, token, createdAt }`. The only time the plain token is returned. `409` over 10 active tokens. |
| `GET /api/extension/tokens`        | `200 [{ id, createdAt, lastUsedAt }]`, active tokens only, never the token or its hash                  |
| `DELETE /api/extension/tokens/:id` | `204`; the token stops working immediately. `404` if unknown or already revoked.                        |

Tokens are 32 random bytes (`cct_` plus base64url). Store only `SHA-256(token)`; look up by hash;
update `lastUsedAt` on use. These routes need CORS for the app's origin (and `DELETE`).

### MongoDB (when the real backend is built)

Use the official `mongodb` driver with one cached client (reuse it across hot reloads and
serverless invocations). Environment: `MONGODB_URI`, `MONGODB_DB`.

| Collection         | Fields                                                                            | Indexes                                                     |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `sync_requests`    | `userId, configId, requestId, createdAt`                                          | unique `{ userId, requestId }`; `{ userId, createdAt: -1 }` |
| `tab_snapshots`    | `userId, requestId, configId, deviceId, deviceName, capturedAt, tabs, receivedAt` | **unique `{ userId, requestId, deviceId }`**                |
| `extension_tokens` | `userId, hash, createdAt, lastUsedAt, revokedAt`                                  | unique `{ hash }`; `{ userId }`                             |

Create the indexes on first connect. Treat a duplicate-key error on `tab_snapshots` as the
idempotent "already stored" case.

## Environment variables

| Variable                    | Where                  | Purpose                                                                   |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `APP_ORIGIN`                | `pnpm ext:build`       | The one web origin the extension trusts. Default `http://localhost:1420`. |
| `VITE_EXTENSION_ID`         | app build (optional)   | Extension id the app messages. Default is the id from the manifest key.   |
| `MOCK_EXTENSION_ID`         | mock server (optional) | Extension id the mock's CORS allows.                                      |
| `MONGODB_URI`, `MONGODB_DB` | the real backend       | MongoDB connection. Not used by anything in this repo.                    |

## Known limits

- The desktop app (Tauri) cannot message the extension: `externally_connectable` only matches
  `http(s)` pages. There the extension relies on its 30-second poll.
- Chrome's minimum alarm period is 30 seconds, and a sleeping browser polls when it wakes.
- Changing the app's origin means rebuilding the extension with a new `APP_ORIGIN`.
- A deployed API on `http://` is accepted only for local testing; use `https://`.
