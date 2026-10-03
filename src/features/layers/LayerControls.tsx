import { useId, useState, type FormEvent } from 'react';
import type { Layer } from '@/api/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { isEnded } from './layerState';
import { useLayerActions } from './useLayerActions';

const btn =
  'min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50';

export function LayerControls({ layer }: { layer: Layer }) {
  const actions = useLayerActions(layer.id);
  const [redirecting, setRedirecting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [confirmKill, setConfirmKill] = useState(false);
  const inputId = useId();
  const ended = isEnded(layer);
  const paused = layer.status === 'paused';

  function submitRedirect(e: FormEvent) {
    e.preventDefault();
    const value = instruction.trim();
    if (!value) return;
    actions.redirect.mutate(value, {
      onSuccess: () => {
        setInstruction('');
        setRedirecting(false);
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {paused ? (
          <button
            type="button"
            className={btn}
            disabled={ended || actions.resume.isPending}
            onClick={() => actions.resume.mutate()}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className={btn}
            disabled={ended || layer.status === 'waiting_approval' || actions.pause.isPending}
            onClick={() => actions.pause.mutate()}
          >
            Pause
          </button>
        )}
        <button
          type="button"
          className={btn}
          disabled={ended}
          aria-expanded={redirecting}
          onClick={() => setRedirecting((v) => !v)}
        >
          Redirect
        </button>
        <button
          type="button"
          className="min-h-touch rounded-lg border border-status-error/60 px-4 text-sm font-medium text-status-error hover:bg-status-error/10 disabled:opacity-50"
          disabled={ended}
          onClick={() => setConfirmKill(true)}
        >
          Kill
        </button>
      </div>

      {redirecting && !ended && (
        <form onSubmit={submitRedirect} className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            New instruction for this layer
          </label>
          <input
            id={inputId}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Tell the layer what to do instead"
            autoComplete="off"
            className="min-h-touch min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
          />
          <button
            type="submit"
            className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
            disabled={!instruction.trim() || actions.redirect.isPending}
          >
            Send
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmKill}
        title="Kill this layer?"
        confirmLabel="Kill layer"
        onCancel={() => setConfirmKill(false)}
        onConfirm={() => {
          setConfirmKill(false);
          actions.kill.mutate();
        }}
      >
        The layer stops immediately and its task is cancelled. Work already done is not undone.
      </ConfirmDialog>
    </div>
  );
}
