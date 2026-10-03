import { useRef } from 'react';
import { useLayerPreview } from '@/hooks/useLayerPreview';
import type { Layer } from '@/api/types';
import { isEnded, noSignalLabel } from './layerState';

export function LayerPreview({ layer }: { layer: Layer }) {
  const ref = useRef<HTMLDivElement>(null);
  const { src, noSignal } = useLayerPreview(layer.id, ref);
  // A paused or ended layer legitimately sends no frames; label it instead of alarming.
  const overlay = noSignal || layer.status === 'paused' || isEnded(layer);
  return (
    <div
      ref={ref}
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-bg"
    >
      {src ? (
        <img
          src={src}
          alt="Live preview of the layer"
          className={`h-full w-full object-cover ${overlay ? 'opacity-50 grayscale' : ''}`}
          draggable={false}
        />
      ) : (
        <div className="h-full w-full bg-raised" />
      )}
      {overlay && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-bg/40 text-sm font-medium"
        >
          {/* Solid chip: the label stays readable over any video frame. */}
          <span className="rounded-full bg-surface px-3 py-1 text-ink">{noSignalLabel(layer)}</span>
        </div>
      )}
    </div>
  );
}
