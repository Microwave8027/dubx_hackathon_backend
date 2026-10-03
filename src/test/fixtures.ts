import type { Approval, Layer, Task } from '@/api/types';

export const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  text: 'Organize Downloads',
  status: 'running',
  weight: 'routine',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

export const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'l1',
  taskId: 't1',
  status: 'running',
  usesScreen: false,
  steps: [{ id: 's0', text: 'List files', status: 'active' }],
  ...over,
});

export const approval = (over: Partial<Approval> = {}): Approval => ({
  id: 'a1',
  layerId: 'l1',
  taskId: 't1',
  action: { category: 'send_message', summary: 'Send an email' },
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
