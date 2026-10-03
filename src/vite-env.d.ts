/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the daemon. Empty or unset means same origin. */
  readonly VITE_API_URL?: string;
  /** "1" enables ?demo=1 seeding in production builds (always on in dev). */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
