import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push(message: string, kind?: Toast['kind']): void;
  dismiss(id: number): void;
}

let next = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, kind = 'info') {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), 6000);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  error: (m: string) => useToastStore.getState().push(m, 'error'),
  info: (m: string) => useToastStore.getState().push(m, 'info'),
};
