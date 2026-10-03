import { useEffect, useId, useState, type FormEvent } from 'react';
import { createApiClient } from '@/api/client';
import { createDirectTransport } from '@/transport/direct';
import { getApiUrl, setApiUrlOverride } from '@/api/config';
import { listPairedDevices, type PairedDevice } from '@/pairing/devices';
import { forgetPairing } from '@/pairing/pair';
import { toast } from '@/state/toastStore';
import { parseBackendUrl } from './backendUrl';
import { Link } from 'react-router-dom';

function PairedDevices() {
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    listPairedDevices()
      .then((d) => live && setDevices(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  async function forget(id: string) {
    try {
      await forgetPairing(id);
      setDevices((d) => d?.filter((x) => x.id !== id) ?? null);
    } catch {
      toast.error('Could not remove that device.');
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Paired devices</h3>
        <Link
          to="/pair"
          className="inline-flex min-h-touch items-center text-sm text-accent underline underline-offset-2"
        >
          Pair a phone
        </Link>
      </div>
      {failed ? (
        <p className="text-sm text-muted">Paired devices are unavailable in this browser.</p>
      ) : devices === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted">No devices paired yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span>
                <span className="block font-medium">{d.name}</span>
                <span className="block text-xs text-muted">
                  Paired {new Date(d.pairedAt).toLocaleDateString()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void forget(d.id)}
                className="min-h-touch rounded px-2 text-muted underline underline-offset-2 hover:text-ink"
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConnectionSection() {
  const id = useId();
  const envUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
  const current = getApiUrl();
  const [value, setValue] = useState(current);
  const [testing, setTesting] = useState(false);
  const parsed = parseBackendUrl(value);
  const invalid = parsed === null;
  const changed = parsed !== null && parsed !== current;

  async function test() {
    if (parsed === null) return;
    setTesting(true);
    try {
      const target = parsed || envUrl;
      const transport = createDirectTransport({ baseUrl: () => target });
      await createApiClient(() => transport).listLayers();
      toast.info('Connected to the agent.');
    } catch {
      toast.error('Could not reach the agent at that address.');
    } finally {
      setTesting(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (parsed === null) return;
    // An empty value goes back to the build default.
    setApiUrlOverride(parsed === '' || parsed === envUrl ? null : parsed);
    window.location.reload(); // reconnect the live stream to the new backend
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          Backend URL
        </label>
        <p className="text-xs text-muted">
          {envUrl
            ? `Default from this build: ${envUrl}`
            : 'Default: the same address as this page.'}{' '}
          Leave empty to use it.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id={id}
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-err` : undefined}
            className="min-h-touch min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void test()}
            disabled={invalid || testing}
            className="min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            type="submit"
            disabled={invalid || !changed}
            className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50"
          >
            Save address
          </button>
        </div>
        {invalid && (
          <p id={`${id}-err`} role="alert" className="text-sm text-status-error">
            Enter a full address starting with http:// or https://
          </p>
        )}
      </form>
      <PairedDevices />
    </div>
  );
}
