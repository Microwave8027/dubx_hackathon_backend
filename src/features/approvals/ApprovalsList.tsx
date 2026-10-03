import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api/client';
import { useApprovalsQuery } from '@/api/queries';
import { PanelState } from '@/components/PanelState';
import { decideApproval } from '@/state/approvals';
import { toast } from '@/state/toastStore';
import { useLiveStore, usePendingApprovals } from '@/state/store';
import { ApprovalCard } from './ApprovalCard';
import { useApprovalShortcuts } from './useApprovalShortcuts';

function ResolvedList() {
  const approvals = useLiveStore((s) => s.approvals);
  const resolved = useMemo(
    () =>
      Object.values(approvals)
        .filter((a) => a.status !== 'pending')
        .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
        .slice(0, 8),
    [approvals],
  );
  if (resolved.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Recently resolved
      </h2>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {resolved.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
            <span>{a.action.summary}</span>
            <span className="shrink-0 text-xs capitalize text-muted">{a.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApprovalsList({ showResolved = false }: { showResolved?: boolean }) {
  const query = useApprovalsQuery();
  const pending = usePendingApprovals();
  const [index, setIndex] = useState(0);
  const selected = Math.min(index, Math.max(pending.length - 1, 0));
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the keyboard selection in view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, pending.length]);

  function decideSelected(decision: 'approve' | 'deny') {
    const a = pending[selected];
    if (!a) return;
    decideApproval(api, a.id, decision).catch(() =>
      toast.error(`Could not ${decision} that action. It is back in your list.`),
    );
  }

  useApprovalShortcuts(pending.length > 0, {
    next: () => setIndex(Math.min(selected + 1, pending.length - 1)),
    prev: () => setIndex(Math.max(selected - 1, 0)),
    approve: () => decideSelected('approve'),
    deny: () => decideSelected('deny'),
  });

  return (
    <>
      <PanelState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={pending.length === 0}
        emptyTitle="Nothing needs you"
        emptyHint="Approvals show up here the moment the agent needs a decision."
      >
        <ul ref={listRef} className="space-y-3" aria-label="Pending approvals">
          {pending.map((a, i) => (
            <li key={a.id}>
              <ApprovalCard approval={a} selected={i === selected} />
            </li>
          ))}
        </ul>
        {pending.length > 0 && (
          <p className="mt-3 hidden text-xs text-muted mid:block">
            Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>a</kbd> approve, <kbd>d</kbd> deny
          </p>
        )}
      </PanelState>
      {showResolved && <ResolvedList />}
    </>
  );
}
