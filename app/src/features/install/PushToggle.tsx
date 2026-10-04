import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { detectTauri } from '@/platform';
import {
  PushError,
  disablePush,
  enablePush,
  getExistingSubscription,
  pushSupport,
} from '@/pwa/push';
import { toast } from '@/state/toastStore';

type Status = 'checking' | 'off' | 'on';

const reasons: Record<string, string> = {
  unsupported: 'Push notifications are not supported in this browser.',
  'ios-needs-install':
    'Add the app to your Home Screen first, then turn notifications on from there.',
  denied: 'Notifications are blocked. Allow them in your browser or system settings.',
};

/** Web Push for phones and browsers. The desktop app uses native notifications instead. */
export function PushToggle() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    let live = true;
    getExistingSubscription()
      .then((s) => live && setStatus(s ? 'on' : 'off'))
      .catch(() => live && setStatus('off'));
    return () => {
      live = false;
    };
  }, []);

  if (detectTauri()) return null;

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush(api);
      setStatus('on');
      toast.info('Notifications are on.');
    } catch (err) {
      toast.error(
        err instanceof PushError ? err.message : 'Could not turn on notifications. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      setStatus('off');
    } catch {
      toast.error('Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Phone notifications</p>
          <p className="text-xs text-muted">
            {support.ok
              ? status === 'on'
                ? 'You will be alerted when the agent needs you.'
                : 'Get alerted when the agent needs you.'
              : reasons[support.reason]}
          </p>
        </div>
        {support.ok && (
          <button
            type="button"
            disabled={busy || status === 'checking'}
            onClick={() => void (status === 'on' ? turnOff() : turnOn())}
            className="min-h-touch shrink-0 rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50"
          >
            {status === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
    </div>
  );
}
