import { ProfileSchema } from '@/api/schemas';
import type { Profile } from '@/api/types';

export interface ProfileErrors {
  windows: Record<number, string>;
  briefingTime?: string;
  schema?: string;
}

/** Same-minute windows are meaningless; end before start is allowed (runs past midnight). */
export function validateProfile(p: Profile): ProfileErrors {
  const errors: ProfileErrors = { windows: {} };
  p.peakWindows.forEach((w, i) => {
    if (w.days.length === 0) errors.windows[i] = 'Pick at least one day.';
    else if (w.start === w.end) errors.windows[i] = 'Start and end must be different.';
  });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.briefingTime))
    errors.briefingTime = 'Enter a valid time.';
  if (!ProfileSchema.safeParse(p).success) errors.schema = 'Some settings are not valid.';
  return errors;
}

export const hasErrors = (e: ProfileErrors): boolean =>
  Object.keys(e.windows).length > 0 || Boolean(e.briefingTime) || Boolean(e.schema);
