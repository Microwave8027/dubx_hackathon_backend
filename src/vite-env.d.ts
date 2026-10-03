/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the daemon. Empty or unset means same origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
