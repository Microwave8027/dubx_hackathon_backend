import { Link, useParams } from 'react-router-dom';
import { useLayersQuery, useLogQuery } from '@/api/queries';
import { StatusBadge } from '@/components/StatusBadge';
import { layerTone, statusLabel } from '@/components/statusTone';
import { useLiveStore } from '@/state/store';
import { LayerControls } from './LayerControls';
import { LayerPreview } from './LayerPreview';
import { StepList } from './StepList';
import { UsingScreenBadge } from './UsingScreenBadge';
import { isEnded } from './layerState';

function LayerLog({ layerId }: { layerId: string }) {
  const log = useLogQuery({ layerId });
  if (log.isLoading) return <p className="text-sm text-muted">Loading activity…</p>;
  if (log.error) {
    return (
      <p role="alert" className="text-sm text-muted">
        Could not load activity.{' '}
        <button type="button" className="underline" onClick={() => void log.refetch()}>
          Retry
        </button>
      </p>
    );
  }
  if (!log.data?.length)
    return <p className="text-sm text-muted">Nothing logged for this layer yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {log.data.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
          <span className={e.undone ? 'text-muted line-through' : ''}>{e.summary}</span>
          <time className="shrink-0 text-xs text-muted" dateTime={e.ts}>
            {new Date(e.ts).toLocaleTimeString()}
          </time>
        </li>
      ))}
    </ul>
  );
}

export function LayerDetail() {
  const { layerId = '' } = useParams();
  const query = useLayersQuery();
  const layer = useLiveStore((s) => s.layers[layerId]);
  const taskText = useLiveStore((s) => (layer ? s.tasks[layer.taskId]?.text : undefined));

  if (!layer) {
    if (query.isLoading) {
      return (
        <div
          role="status"
          aria-label="Loading"
          className="h-64 animate-pulse-soft rounded-card bg-raised"
        />
      );
    }
    return (
      <section>
        <h1 className="text-xl font-semibold">Layer not found</h1>
        <p className="mt-2 text-sm text-muted">
          {query.error ? 'Could not reach the agent.' : 'It may have been cleaned up.'}
        </p>
        <Link to="/?tab=layers" className="mt-3 inline-flex min-h-touch items-center underline">
          Back to layers
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="layer-title" className="mx-auto max-w-4xl space-y-5">
      <Link
        to="/?tab=layers"
        className="inline-flex min-h-touch items-center text-sm text-muted hover:text-ink"
      >
        ← Layers
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 id="layer-title" className="mr-2 break-words text-xl font-semibold">
          {taskText ?? layer.taskId}
        </h1>
        <StatusBadge tone={layerTone[layer.status]} label={statusLabel(layer.status)} />
        {layer.usesScreen && !isEnded(layer) && <UsingScreenBadge />}
      </div>
      <LayerPreview layer={layer} />
      <LayerControls layer={layer} />
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Steps</h2>
        <StepList steps={layer.steps} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        <LayerLog layerId={layer.id} />
      </div>
    </section>
  );
}
