import { useMemo } from 'react';
import { useLayersQuery } from '@/api/queries';
import { PanelState } from '@/components/PanelState';
import { useLiveStore } from '@/state/store';
import { LayerCard } from './LayerCard';
import { isEnded } from './layerState';

export function LayersPanel() {
  const query = useLayersQuery();
  const layersById = useLiveStore((s) => s.layers);
  // Running layers first; ended ones sink to the bottom.
  const layers = useMemo(
    () =>
      Object.values(layersById).sort(
        (a, b) => Number(isEnded(a)) - Number(isEnded(b)) || a.id.localeCompare(b.id),
      ),
    [layersById],
  );
  return (
    <PanelState
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={layers.length === 0}
      emptyTitle="No layers running"
      emptyHint="Each task runs in its own sandboxed layer."
    >
      <ul className="space-y-3" aria-label="Layers">
        {layers.map((l) => (
          <li key={l.id}>
            <LayerCard layer={l} />
          </li>
        ))}
      </ul>
    </PanelState>
  );
}
