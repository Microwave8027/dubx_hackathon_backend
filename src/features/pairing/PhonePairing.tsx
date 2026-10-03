import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InstallGuide } from '@/features/install/InstallGuide';
import { PushToggle } from '@/features/install/PushToggle';
import { completePairing } from '@/pairing/pair';
import { defaultDeviceName, type PairingParams } from '@/pairing/pairingLink';
import { toast } from '@/state/toastStore';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function InvalidPairingLink() {
  return (
    <section aria-labelledby="pair-title" className="mx-auto max-w-md space-y-3">
      <h1 id="pair-title" className="text-xl font-semibold">
        This pairing link is not valid
      </h1>
      <p className="text-sm text-muted">
        It may be incomplete or expired. Go back to the computer and make a new code.
      </p>
      <Link to="/" className="inline-flex min-h-touch items-center text-accent underline">
        Back to the app
      </Link>
    </section>
  );
}

export function PhonePairing({ params }: { params: PairingParams }) {
  const [name, setName] = useState(() => defaultDeviceName());
  const [state, setState] = useState<'confirm' | 'saving' | 'done'>('confirm');
  const target = params.relay ?? params.api ?? '';

  async function pair() {
    setState('saving');
    try {
      await completePairing(params, name);
      setState('done');
    } catch {
      setState('confirm');
      toast.error('Could not save the pairing on this device.');
    }
  }

  if (state === 'done') {
    return (
      <section aria-labelledby="pair-title" className="mx-auto max-w-md space-y-4">
        <h1 id="pair-title" className="text-xl font-semibold">
          Paired
        </h1>
        <p className="text-sm text-muted">
          This device is connected to the agent at <strong>{hostOf(target)}</strong>. One more step
          makes it feel like a real app.
        </p>
        <InstallGuide />
        <PushToggle />
        <button
          type="button"
          // A full load so the live connection starts against the newly paired agent.
          onClick={() => window.location.assign('/')}
          className="min-h-touch w-full rounded-lg bg-accent px-4 text-sm font-semibold text-bg"
        >
          Open Command Center
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="pair-title" className="mx-auto max-w-md space-y-4">
      <h1 id="pair-title" className="text-xl font-semibold">
        Pair this device?
      </h1>
      <p className="text-sm text-muted">
        This will connect to the agent at <strong className="text-ink">{hostOf(target)}</strong> and
        let this device approve actions and watch layers. Only continue if you just made this code
        on your own computer.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="device-name" className="text-sm font-medium">
          Name this device
        </label>
        <input
          id="device-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="min-h-touch rounded-lg border border-line bg-surface px-3 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Link
          to="/"
          className="inline-flex min-h-touch flex-1 items-center justify-center rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={() => void pair()}
          disabled={state === 'saving'}
          className="min-h-touch flex-1 rounded-lg bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {state === 'saving' ? 'Pairing…' : 'Pair this device'}
        </button>
      </div>
    </section>
  );
}
