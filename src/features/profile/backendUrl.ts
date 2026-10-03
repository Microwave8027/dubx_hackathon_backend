export function parseBackendUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed.replace(/\/+$/, '');
  } catch {
    return null;
  }
}
