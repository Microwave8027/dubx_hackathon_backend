import { Link } from 'react-router-dom';
import { useApprovalsQuery } from '@/api/queries';
import { PanelState } from '@/components/PanelState';
import { usePendingApprovals } from '@/state/store';

// Summary list; the full inbox with decisions arrives in the approvals PR.
export function ApprovalsPanel() {
  const query = useApprovalsQuery();
  const pending = usePendingApprovals();
  return (
    <PanelState
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={pending.length === 0}
      emptyTitle="Nothing needs you"
      emptyHint="Approvals show up here the moment the agent needs a decision."
    >
      <ul className="space-y-2" aria-label="Pending approvals">
        {pending.map((a) => (
          <li key={a.id} className="rounded-card border border-status-needs/40 bg-surface p-3">
            <p className="text-sm font-medium">{a.action.summary}</p>
            <Link to="/approvals" className="mt-1 inline-block text-xs text-muted underline">
              Review
            </Link>
          </li>
        ))}
      </ul>
    </PanelState>
  );
}
