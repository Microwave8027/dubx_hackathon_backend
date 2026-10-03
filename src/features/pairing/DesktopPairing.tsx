import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PairingStart } from '@/api/types';
import { toast } from '@/state/toastStore';
import { qrDataUri } from './qr';

function useCountdown(expiresAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

function Code({ pairing }: { pairing: PairingStart }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const left = useCountdown(pairing.expiresAt);

  useEffect(() => {
    let live = true;
    qrDataUri(pairing.url)
      .then((s) => live && setSrc(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pairing.url]);

  const expired = left === 0;
  return (
    <div className="space-y-4">
      <div className="mx-auto w-fit rounded-card bg-white p-2">
        {src && !failed ? (
          <img
            src={src}
            alt="QR code for pairing a phone. Scan it with your phone camera."
            width={256}
            height={256}
            className={`h-64 w-64 ${expired ? 'opacity-20' : ''}`}
          />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center text-sm text-slate-500">
            {failed ? 'Could not draw the code.' : 'Drawing code…'}
          </div>
        )}
      </div>
      {left !== null && (
        <p className="text-center text-sm text-muted" aria-live="polite">
          {expired
            ? 'This code has expired. Make a new one.'
            : `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </p>
      )}
      <div className="rounded-lg bg-raised p-3 text-xs">
        <p className="mb-1 text-muted">Or open this link on your phone:</p>
        <p className="break-all font-mono">{pairing.url}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(pairing.url)
              .then(() => toast.info('Link copied.'))
              .catch(() => toast.error('Could not copy the link.'));
          }}
          className="mt-2 min-h-touch rounded-lg bg-surface px-4 text-sm font-medium hover:bg-line"
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

export function DesktopPairing() {
  const start = useMutation({
    mutationFn: api.startPairing,
    onError: () => toast.error('Could not start pairing.'),
  });

  return (
    <section aria-labelledby="pair-title" className="mx-auto max-w-md space-y-5">
      <header>
        <h1 id="pair-title" className="text-xl font-semibold">
          Pair a phone
        </h1>
        <p className="mt-1 text-sm text-muted">
          Scan the code with your phone. You will confirm there before anything is connected, and
          can install the app to your Home Screen.
        </p>
      </header>
      {start.data ? (
        <Code pairing={start.data} />
      ) : (
        <div className="rounded-card border border-dashed border-line p-8 text-center">
          <p className="mb-4 text-sm text-muted">
            {start.isError
              ? 'Pairing could not start. Check the connection, then try again.'
              : 'Make a one-time code to connect a phone.'}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => start.mutate()}
        disabled={start.isPending}
        className="min-h-touch w-full rounded-lg bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50"
      >
        {start.isPending ? 'Making code…' : start.data ? 'Make a new code' : 'Show pairing code'}
      </button>
    </section>
  );
}
