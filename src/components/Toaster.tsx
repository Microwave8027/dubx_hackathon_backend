import { useToastStore } from '@/state/toastStore';

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 mid:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.kind === 'error'
              ? 'border-status-error/50 bg-surface text-ink'
              : 'border-line bg-surface text-ink'
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${t.kind === 'error' ? 'bg-status-error' : 'bg-accent'}`}
          />
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="min-h-touch min-w-touch rounded text-muted hover:text-ink"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
