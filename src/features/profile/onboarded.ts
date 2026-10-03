const KEY = 'cc.onboarded';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // never trap someone in onboarding when storage is unavailable
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}
