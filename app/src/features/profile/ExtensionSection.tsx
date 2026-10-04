import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiUrl } from '@/api/config';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  createExtensionToken,
  listExtensionTokens,
  revokeExtensionToken,
  type ExtensionToken,
} from '@/extension/api';
import { isExtensionInstalled } from '@/extension/bridge';
import { toast } from '@/state/toastStore';

const KEY = ['extension-tokens'] as const;
const btn =
  'min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

/** Connect the Chrome extension: make a token (shown once), see and revoke tokens. */
export function ExtensionSection() {
  const queryClient = useQueryClient();
  // The plain token lives only in this component's state: never cached, stored or logged.
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ExtensionToken | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isExtensionInstalled().then((ok) => !cancelled && setInstalled(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  const tokens = useQuery({ queryKey: KEY, queryFn: listExtensionTokens, retry: false });

  const create = useMutation({
    mutationFn: createExtensionToken,
    onSuccess: (created) => {
      setFresh(created.token);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error('Could not create a token. Try again.'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeExtensionToken(id),
    onSuccess: () => {
      toast.info('Token revoked. That browser stops syncing.');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error('Could not revoke the token. Try again.'),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.info('Copied.');
    } catch {
      toast.error('Could not copy. Select the token and copy it by hand.');
    }
  }

  const apiUrl = getApiUrl() || window.location.origin;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">
        {installed === null
          ? 'Looking for the extension…'
          : installed
            ? 'The extension is installed in this browser.'
            : 'The extension was not found in this browser. Install it, or connect a different browser below.'}
      </p>

      {fresh ? (
        <div
          role="group"
          aria-label="New token"
          className="space-y-3 rounded-card border border-accent bg-surface p-4"
        >
          <p className="text-sm font-medium">
            Copy this token now. It is shown once and cannot be recovered.
          </p>
          <input
            readOnly
            aria-label="Extension token"
            value={fresh}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-touch w-full rounded-lg border border-line bg-bg px-3 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => void copy(fresh)}>
              Copy token
            </button>
            <button type="button" className={btn} onClick={() => void copy(apiUrl)}>
              Copy API URL
            </button>
            <button
              type="button"
              className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent"
              onClick={() => setFresh(null)}
            >
              I’ve saved it
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Open the extension’s Settings page in Chrome.</li>
            <li>
              Paste the API URL <code className="rounded bg-raised px-1">{apiUrl}</code> and this
              token, accept the consent note, then press Save.
            </li>
          </ol>
        </div>
      ) : (
        <button
          type="button"
          className={btn}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Creating…' : 'Generate token'}
        </button>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Connected tokens</h3>
        {tokens.isLoading ? (
          <p role="status" className="text-sm text-muted">
            Loading…
          </p>
        ) : tokens.isError ? (
          <p role="alert" className="text-sm text-muted">
            Could not load tokens.{' '}
            <button type="button" className="underline" onClick={() => void tokens.refetch()}>
              Try again
            </button>
          </p>
        ) : tokens.data && tokens.data.length > 0 ? (
          <ul
            aria-label="Tokens"
            className="divide-y divide-line rounded-card border border-line bg-surface"
          >
            {tokens.data.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  Created {when(t.createdAt)}
                  <span className="block text-xs text-muted">Last used {when(t.lastUsedAt)}</span>
                </span>
                <button type="button" className={btn} onClick={() => setRevoking(t)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No tokens yet.</p>
        )}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this token?"
        confirmLabel="Revoke"
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking.id);
          setRevoking(null);
        }}
      >
        The browser using it stops syncing right away. You can generate a new token any time.
      </ConfirmDialog>
    </div>
  );
}
