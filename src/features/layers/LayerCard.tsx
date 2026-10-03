import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { Layer } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { layerTone, statusLabel } from '@/components/statusTone';
import { useLiveStore } from '@/state/store';
import { LayerControls } from './LayerControls';
import { LayerPreview } from './LayerPreview';
import { StepList } from './StepList';
import { UsingScreenBadge } from './UsingScreenBadge';
import { currentStep, isEnded } from './layerState';

export const LayerCard = memo(function LayerCard({ layer }: { layer: Layer }) {
  const taskText = useLiveStore((s) => s.tasks[layer.taskId]?.text);
  const step = currentStep(layer);
  return (
    <article
      aria-label={taskText ?? 'Layer'}
      className="space-y-3 rounded-card border border-line bg-surface p-3"
    >
      <LayerPreview layer={layer} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={layerTone[layer.status]} label={statusLabel(layer.status)} />
        {layer.usesScreen && !isEnded(layer) && <UsingScreenBadge />}
      </div>
      <div>
        <Link
          to={`/layers/${layer.id}`}
          className="break-words text-sm font-semibold hover:underline"
        >
          {taskText ?? layer.taskId}
        </Link>
        {step && !isEnded(layer) && <p className="mt-0.5 text-sm text-muted">Now: {step.text}</p>}
      </div>
      <details className="group">
        <summary className="min-h-touch cursor-pointer list-none py-2 text-xs font-medium text-muted hover:text-ink">
          <span className="group-open:hidden">Show steps ({layer.steps.length})</span>
          <span className="hidden group-open:inline">Hide steps</span>
        </summary>
        <StepList steps={layer.steps} />
      </details>
      <LayerControls layer={layer} />
    </article>
  );
});
