import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTasksQuery } from '@/api/queries';
import type { Task } from '@/api/types';
import { PanelState } from '@/components/PanelState';
import { StatusBadge } from '@/components/StatusBadge';
import { statusLabel, taskTone } from '@/components/statusTone';
import { useLiveStore } from '@/state/store';
import { toast } from '@/state/toastStore';
import { Link } from 'react-router-dom';

const order: Record<Task['status'], number> = {
  waiting_approval: 0,
  running: 1,
  queued: 2,
  scheduled: 3,
  failed: 4,
  done: 5,
  cancelled: 6,
};

function TaskRow({ task }: { task: Task }) {
  const cancel = useMutation({
    mutationFn: () => api.patchTask(task.id, { status: 'cancelled' }),
    onSuccess: (t) => useLiveStore.getState().applyEvent({ type: 'task.updated', data: t }),
    onError: () => toast.error('Could not cancel the task.'),
  });
  const cancellable = task.status === 'queued' || task.status === 'scheduled';
  return (
    <li className="rounded-card border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-medium">{task.text}</p>
        <StatusBadge tone={taskTone[task.status]} label={statusLabel(task.status)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{task.weight === 'judgment' ? 'Needs judgment' : 'Routine'}</span>
        {task.scheduledFor && <span>Scheduled {new Date(task.scheduledFor).toLocaleString()}</span>}
        {task.layerId && (
          <Link
            className="inline-flex min-h-touch items-center rounded underline underline-offset-2 hover:text-ink"
            to={`/layers/${task.layerId}`}
          >
            View layer
          </Link>
        )}
        {cancellable && (
          <button
            type="button"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="min-h-touch rounded px-2 underline underline-offset-2 hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
      {task.result && <p className="mt-2 text-sm text-muted">{task.result.summary}</p>}
    </li>
  );
}

export function TaskList() {
  const query = useTasksQuery();
  const tasksById = useLiveStore((s) => s.tasks);
  const tasks = useMemo(
    () =>
      Object.values(tasksById).sort(
        (a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt),
      ),
    [tasksById],
  );
  return (
    <PanelState
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={tasks.length === 0}
      emptyTitle="No tasks yet"
      emptyHint="Add one above and the agent will start in its own layer."
    >
      <ul className="space-y-2" aria-label="Tasks">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </PanelState>
  );
}
