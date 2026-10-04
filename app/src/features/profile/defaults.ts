import type { ActionCategory, PeakWindow, Profile } from '@/api/types';

/** Shown in the editor but not editable: the agent must always stop for these. */
export const LOCKED_CATEGORIES: readonly ActionCategory[] = ['make_payment', 'delete_files'];
export const isLocked = (c: ActionCategory): boolean => LOCKED_CATEGORIES.includes(c);

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5];

export const defaultWindow = (): PeakWindow => ({
  days: [...WEEKDAYS],
  start: '10:00',
  end: '14:00',
});

export function defaultProfile(): Profile {
  return {
    chronotype: 'neutral',
    peakWindows: [defaultWindow()],
    briefingTime: '08:30',
    tiers: {
      read_web: 'auto',
      write_files: 'ask',
      move_files: 'ask',
      delete_files: 'never',
      send_message: 'ask',
      make_payment: 'never',
      install_software: 'ask',
      use_screen: 'ask',
    },
  };
}

/** Locked categories are forced to "never" whatever the server or the form says. */
export function sanitizeProfile(p: Profile): Profile {
  const tiers = { ...p.tiers };
  for (const c of LOCKED_CATEGORIES) tiers[c] = 'never';
  return { ...p, tiers };
}
