import type { LayerStatus, TaskStatus } from '@/api/types';

export type Tone = 'idle' | 'working' | 'needs' | 'done' | 'error';

export const taskTone: Record<TaskStatus, Tone> = {
  queued: 'idle',
  scheduled: 'idle',
  running: 'working',
  waiting_approval: 'needs',
  done: 'done',
  failed: 'error',
  cancelled: 'idle',
};

export const layerTone: Record<LayerStatus, Tone> = {
  starting: 'working',
  running: 'working',
  paused: 'idle',
  waiting_approval: 'needs',
  done: 'done',
  error: 'error',
  killed: 'idle',
};

export const statusLabel = (s: string): string => {
  const text = s.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
