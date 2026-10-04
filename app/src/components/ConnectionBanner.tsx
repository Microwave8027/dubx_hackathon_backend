import { useOnline } from '@/hooks/useOnline';
import { useLiveStore } from '@/state/store';

export function ConnectionBanner() {
  const online = useOnline();
  const connection = useLiveStore((s) => s.connection);
  let message: string | null = null;
  if (!online) message = 'You are offline. Showing the last known state.';
  else if (connection === 'reconnecting') message = 'Reconnecting to the agent…';
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-status-needs/40 bg-status-needs/10 px-4 py-2 text-center text-sm text-status-needs"
    >
      {message}
    </div>
  );
}
