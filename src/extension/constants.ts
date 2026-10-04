/**
 * The Chrome extension's id. It is stable because extension/manifest.template.json carries the
 * public key it is derived from (mock/extension.test.ts checks they agree). Override with
 * VITE_EXTENSION_ID if you publish the extension under a different id.
 */
export const EXTENSION_ID: string =
  (import.meta.env.VITE_EXTENSION_ID as string | undefined) || 'dkalbkpfkomiienoddgbkngihfhbjinp';
