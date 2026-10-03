import { getApiUrl } from '@/api/config';

/**
 * ?demo=1 reseeds the mock daemon with the three demo tasks (research + summary file, organize a
 * test Downloads folder with undo, draft an email that raises an approval before sending).
 * Only available in dev builds or with VITE_DEMO=1, and a real daemon simply answers 404.
 */
export async function maybeSeedDemo(): Promise<void> {
  if (!(import.meta.env.DEV || import.meta.env.VITE_DEMO === '1')) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('demo') !== '1') return;
  // Remove the flag first so a reload does not reseed over the user's work.
  url.searchParams.delete('demo');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  try {
    await fetch(`${getApiUrl()}/__mock/demo`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* no mock daemon here: nothing to seed */
  }
}
