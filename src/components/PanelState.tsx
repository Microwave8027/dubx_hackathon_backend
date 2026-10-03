import type { ReactNode } from 'react';
import { useOnline } from '@/hooks/useOnline';

interface Props {
  isLoading: boolean;
  error: unknown;
  onRetry(): void;
  isEmpty: boolean;
  emptyTitle: string;
  emptyHint?: string;
  children: ReactNode;
}

/** Shared loading / error / offline / empty handling for list panels. */
export function PanelState({
  isLoading,
  error,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyHint,
  children,
}: Props) {
  const online = useOnline();
  if (isLoading && isEmpty) {
    return (
      <div role="status" aria-label="Loading" className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse-soft rounded-card bg-raised" />
        ))}
      </div>
    );
  }
  if (error && isEmpty) {
    return (
      <div role="alert" className="rounded-card border border-line bg-surface p-4 text-sm">
        <p className="font-medium">{online ? 'Could not reach the agent.' : 'You are offline.'}</p>
        <p className="mt-1 text-muted">
          {online
            ? 'Check the connection settings, then try again.'
            : 'Reconnect to see live data.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
        >
          Retry
        </button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="rounded-card border border-dashed border-line p-6 text-center">
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyHint && <p className="mt-1 text-sm text-muted">{emptyHint}</p>}
      </div>
    );
  }
  return <>{children}</>;
}
