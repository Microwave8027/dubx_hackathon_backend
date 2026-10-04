import type { Layer, Step } from '@/api/types';

export const isEnded = (l: Layer): boolean =>
  l.status === 'done' || l.status === 'error' || l.status === 'killed';

export const currentStep = (l: Layer): Step | undefined =>
  l.steps.find((s) => s.status === 'active') ?? l.steps.find((s) => s.status === 'pending');

export function noSignalLabel(l: Layer): string {
  if (l.status === 'paused') return 'Paused';
  if (isEnded(l)) return 'Layer ended';
  return 'No signal';
}
