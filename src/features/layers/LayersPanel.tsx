import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLayersQuery } from '@/api/queries';
import { PanelState } from '@/components/PanelState';
import { StatusBadge } from '@/components/StatusBadge';
import { layerTone, statusLabel } from '@/components/statusTone';
import { useLiveStore } from '@/state/store';

// Placeholder list; replaced by live layer cards in the next PR.
export function LayersPanel() {
  const query = useLayersQuery();
  const layersById = useLiveStore((s) => s.layers);
  const tasks = useLiveStore((s) => s.tasks);
  const layers = useMemo(() => Object.values(layersById), [layersById]);
  return (
    <PanelState
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={layers.length === 0}
      emptyTitle="No layers running"
      emptyHint="Each task runs in its own sandboxed layer."
    >
      <ul className="space-y-2" aria-label="Layers">
        {layers.map((l) => (
          <li key={l.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <Link
                to={`/layers/${l.id}`}
                className="min-w-0 break-words text-sm font-medium hover:underline"
              >
                {tasks[l.taskId]?.text ?? l.taskId}
              </Link>
              <StatusBadge tone={layerTone[l.status]} label={statusLabel(l.status)} />
            </div>
          </li>
        ))}
      </ul>
    </PanelState>
  );
}
