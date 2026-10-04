import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { notifyExtensionConfigSaved } from '@/extension/bridge';
import { queryKeys } from '@/api/queries';
import type { Profile } from '@/api/types';
import { toast } from '@/state/toastStore';
import { sanitizeProfile } from './defaults';
import { hasErrors, validateProfile } from './validate';

/** Validates, forces locked tiers, and PUTs the profile. */
export function useProfileSave(onSaved?: (saved: Profile) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Profile) => {
      const clean = sanitizeProfile(profile);
      if (hasErrors(validateProfile(clean))) throw new Error('invalid');
      return api.putProfile(clean);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile, saved);
      toast.info('Saved.');
      // Instant capture on this browser; the extension on other browsers picks it up by polling.
      void notifyExtensionConfigSaved();
      onSaved?.(saved);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error && err.message === 'invalid'
          ? 'Fix the highlighted settings first.'
          : 'Could not save your settings. Try again.',
      ),
  });
}
