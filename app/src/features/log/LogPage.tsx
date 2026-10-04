import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { categoryLabel } from '@/api/categories';
import { useLayersQuery, useLogQuery } from '@/api/queries';
import { ACTION_CATEGORIES } from '@/api/schemas';
import type { ActionCategory } from '@/api/types';
import { PanelState } from '@/components/PanelState';
import { useLiveStore } from '@/state/store';
import { LogEntryRow } from './LogEntryRow';

const select =
  'min-h-touch rounded-lg border border-line bg-surface px-3 text-sm [color-scheme:inherit]';

export function LogPage() {
  const [params, setParams] = useSearchParams();
  const layerId = params.get('layer') ?? '';
  const rawCategory = params.get('category');
  const category = ACTION_CATEGORIES.find((c) => c === rawCategory);

  useLayersQuery();
  const layers = useLiveStore((s) => s.layers);
  const tasks = useLiveStore((s) => s.tasks);
  const query = useLogQuery({ layerId: layerId || undefined, category });
  const entries = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => b.ts.localeCompare(a.ts)),
    [query.data],
  );

  function setFilter(key: 'layer' | 'category', value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const filtered = Boolean(layerId || category);
  return (
    <section aria-labelledby="log-title" className="mx-auto max-w-3xl space-y-4">
      <h1 id="log-title" className="text-xl font-semibold">
        Activity
      </h1>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="log-layer" className="text-xs font-medium text-muted">
            Layer
          </label>
          <select
            id="log-layer"
            value={layerId}
            onChange={(e) => setFilter('layer', e.target.value)}
            className={select}
          >
            <option value="">All layers</option>
            {Object.values(layers).map((l) => (
              <option key={l.id} value={l.id}>
                {tasks[l.taskId]?.text ?? l.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="log-category" className="text-xs font-medium text-muted">
            Category
          </label>
          <select
            id="log-category"
            value={category ?? ''}
            onChange={(e) => setFilter('category', e.target.value)}
            className={select}
          >
            <option value="">All categories</option>
            {ACTION_CATEGORIES.map((c: ActionCategory) => (
              <option key={c} value={c}>
                {categoryLabel[c]}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className="min-h-touch self-end rounded-lg px-3 text-sm text-muted underline underline-offset-2 hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      <PanelState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={entries.length === 0}
        emptyTitle={filtered ? 'Nothing matches these filters' : 'No activity yet'}
        emptyHint={
          filtered ? 'Try clearing a filter.' : 'Everything the agent does will be listed here.'
        }
      >
        <ul
          className="divide-y divide-line rounded-card border border-line bg-surface"
          aria-label="Activity log"
        >
          {entries.map((e) => (
            <LogEntryRow key={e.id} entry={e} />
          ))}
        </ul>
      </PanelState>
    </section>
  );
}
