/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the daemon. Empty or unset means same origin. */
  readonly VITE_API_URL?: string;
  /** "1" enables ?demo=1 seeding in production builds (always on in dev). */
  readonly VITE_DEMO?: string;
  /** "tauri" reads the calendar through a Rust command instead of HTTP (desktop only). */
  readonly VITE_CALENDAR_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
