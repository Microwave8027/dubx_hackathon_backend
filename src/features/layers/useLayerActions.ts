import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Layer } from '@/api/types';
import { useLiveStore } from '@/state/store';
import { toast } from '@/state/toastStore';

function useLayerMutation<V = void>(fn: (v: V) => Promise<Layer>, failure: string) {
  return useMutation({
    mutationFn: fn,
    onSuccess: (layer: Layer) =>
      useLiveStore.getState().applyEvent({ type: 'layer.updated', data: layer }),
    onError: () => toast.error(failure),
  });
}

export function useLayerActions(layerId: string) {
  return {
    pause: useLayerMutation(() => api.pauseLayer(layerId), 'Could not pause the layer.'),
    resume: useLayerMutation(() => api.resumeLayer(layerId), 'Could not resume the layer.'),
    kill: useLayerMutation(() => api.killLayer(layerId), 'Could not stop the layer.'),
    redirect: useLayerMutation(
      (instruction: string) => api.redirectLayer(layerId, instruction),
      'Could not redirect the layer.',
    ),
  };
}
