import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useApprovalsQuery, useBriefingQuery } from '@/api/queries';
import type { Briefing } from '@/api/types';
import { ApprovalCard } from '@/features/approvals/ApprovalCard';
import { PanelState } from '@/components/PanelState';
import { useLiveStore } from '@/state/store';

const kindLabel: Record<Briefing['kind'], string> = {
  morning: 'Morning briefing',
  evening: 'Evening briefing',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Decisions({ ids }: { ids: string[] }) {
  const approvals = useLiveStore((s) => s.approvals);
  if (ids.length === 0) {
    return <p className="text-sm text-muted">Nothing needs a decision right now.</p>;
  }
  return (
    <ul className="space-y-3">
      {ids.map((id) => {
        const a = approvals[id];
        if (!a) return null;
        return (
          <li key={id}>
            {a.status === 'pending' ? (
              <ApprovalCard approval={a} compact />
            ) : (
              <p className="rounded-card border border-line bg-surface p-3 text-sm">
                {a.action.summary} <span className="text-muted">({a.status})</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BriefingBody({ briefing }: { briefing: Briefing }) {
  const tasks = useLiveStore((s) => s.tasks);
  return (
    <div className="space-y-8">
      <header>
        <h1 id="briefing-title" className="text-xl font-semibold">
          {kindLabel[briefing.kind]}
        </h1>
        <p className="mt-1 text-sm text-muted">
          <time dateTime={briefing.generatedAt}>
            {new Date(briefing.generatedAt).toLocaleString()}
          </time>
        </p>
      </header>

      <Section title="Summary">
        <p className="text-base leading-relaxed">{briefing.summary}</p>
      </Section>

      <Section title="What finished">
        {briefing.finished.length === 0 ? (
          <p className="text-sm text-muted">Nothing has finished yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {briefing.finished.map((f) => {
              const layerId = tasks[f.taskId]?.layerId;
              return (
                <li key={f.taskId} className="p-3 text-sm">
                  <p className="font-medium">{f.text}</p>
                  {f.summary && <p className="mt-0.5 text-muted">{f.summary}</p>}
                  {layerId && (
                    <Link
                      to={`/layers/${layerId}`}
                      className="mt-1 inline-flex min-h-touch items-center text-xs text-accent-ink underline underline-offset-2"
                    >
                      View layer
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="What needs a decision">
        <Decisions ids={briefing.approvalIds} />
      </Section>
    </div>
  );
}

export function BriefingPage() {
  const query = useBriefingQuery();
  useApprovalsQuery(); // keeps the inline decisions in sync with the inbox
  // No briefing yet is an empty state, not an error.
  const none = query.error instanceof ApiError && query.error.status === 404;
  return (
    <section aria-labelledby="briefing-title" className="mx-auto max-w-2xl">
      {!query.data && (
        <h1 id="briefing-title" className="mb-4 text-xl font-semibold">
          Briefing
        </h1>
      )}
      <PanelState
        isLoading={query.isLoading}
        error={none ? null : query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!query.data}
        emptyTitle="No briefing yet"
        emptyHint="Your first summary will appear here at your briefing time."
      >
        {query.data && <BriefingBody briefing={query.data} />}
      </PanelState>
    </section>
  );
}
