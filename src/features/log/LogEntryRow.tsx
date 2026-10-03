import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { categoryLabel } from '@/api/categories';
import type { LogEntry } from '@/api/types';
import { useLiveStore } from '@/state/store';
import { toast } from '@/state/toastStore';

export function LogEntryRow({ entry, showLayer = true }: { entry: LogEntry; showLayer?: boolean }) {
  const queryClient = useQueryClient();
  const layer = useLiveStore((s) => s.layers[entry.layerId]);
  const taskText = useLiveStore((s) => (layer ? s.tasks[layer.taskId]?.text : undefined));

  const undo = useMutation({
    mutationFn: () => api.undoLogEntry(entry.id),
    onSuccess: () => {
      toast.info('Undone.');
      return queryClient.invalidateQueries({ queryKey: ['log'] });
    },
    onError: () => {
      toast.error('Could not undo that. It may no longer be reversible.');
      void queryClient.invalidateQueries({ queryKey: ['log'] });
    },
  });

  return (
    <li className="flex flex-col gap-2 p-3 mid:flex-row mid:items-center mid:justify-between">
      <div className="min-w-0">
        <p className={`text-sm ${entry.undone ? 'text-muted line-through' : ''}`}>
          {entry.summary}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <time dateTime={entry.ts}>{new Date(entry.ts).toLocaleString()}</time>
          <span className="rounded-full bg-raised px-2 py-0.5">
            {categoryLabel[entry.category]}
          </span>
          {showLayer && (
            <Link
              to={`/layers/${entry.layerId}`}
              className="underline underline-offset-2 hover:text-ink"
            >
              {taskText ?? 'View layer'}
            </Link>
          )}
          {entry.undone && <span className="font-medium text-status-idle">Undone</span>}
        </p>
      </div>
      {entry.reversible && !entry.undone && (
        <button
          type="button"
          onClick={() => undo.mutate()}
          disabled={undo.isPending}
          aria-label={`Undo: ${entry.summary}`}
          className="min-h-touch shrink-0 rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50"
        >
          {undo.isPending ? 'Undoing…' : 'Undo'}
        </button>
      )}
    </li>
  );
}
