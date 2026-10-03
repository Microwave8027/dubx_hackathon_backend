import { create } from 'zustand';
import type { Approval, Layer, ServerEvent, Task } from '@/api/types';
import type { ConnectionState } from '@/api/ws';
import { pushFrame } from './frameStore';

type ById<T> = Record<string, T>;
const byId = <T extends { id: string }>(items: T[]): ById<T> =>
  Object.fromEntries(items.map((i) => [i.id, i]));

export interface LiveState {
  tasks: ById<Task>;
  layers: ById<Layer>;
  approvals: ById<Approval>;
  connection: ConnectionState;
  /** Set when a briefing.ready event arrives; consumers refetch the briefing query. */
  briefingTick: number;
  setConnection(state: ConnectionState): void;
  hydrate(data: Partial<{ tasks: Task[]; layers: Layer[]; approvals: Approval[] }>): void;
  applyEvent(event: ServerEvent): void;
  /** Optimistically sets approval status; returns a function that restores the previous one. */
  setApprovalStatus(id: string, status: Approval['status']): () => void;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  tasks: {},
  layers: {},
  approvals: {},
  connection: 'closed',
  briefingTick: 0,
  setConnection: (connection) => set({ connection }),
  hydrate: (data) =>
    set((s) => ({
      tasks: data.tasks ? byId(data.tasks) : s.tasks,
      layers: data.layers ? byId(data.layers) : s.layers,
      approvals: data.approvals ? byId(data.approvals) : s.approvals,
    })),
  applyEvent: (event) => {
    switch (event.type) {
      case 'task.updated':
        set((s) => ({ tasks: { ...s.tasks, [event.data.id]: event.data } }));
        break;
      case 'layer.updated':
        set((s) => ({ layers: { ...s.layers, [event.data.id]: event.data } }));
        break;
      case 'layer.frame':
        pushFrame(event.data);
        break;
      case 'approval.requested':
      case 'approval.resolved':
        set((s) => ({ approvals: { ...s.approvals, [event.data.id]: event.data } }));
        break;
      case 'briefing.ready':
        set((s) => ({ briefingTick: s.briefingTick + 1 }));
        break;
    }
  },
  setApprovalStatus: (id, status) => {
    const prev = get().approvals[id];
    if (!prev) return () => {};
    set((s) => ({ approvals: { ...s.approvals, [id]: { ...prev, status } } }));
    return () => {
      // Only roll back if nothing newer (e.g. a WS resolve) replaced our optimistic value.
      const cur = get().approvals[id];
      if (cur && cur.status === status) {
        set((s) => ({ approvals: { ...s.approvals, [id]: prev } }));
      }
    };
  },
}));

export const selectPendingApprovals = (s: LiveState): Approval[] =>
  Object.values(s.approvals)
    .filter((a) => a.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const selectPendingCount = (s: LiveState): number =>
  Object.values(s.approvals).filter((a) => a.status === 'pending').length;
