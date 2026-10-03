import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { categoryLabel } from '@/api/categories';
import type { Approval } from '@/api/types';
import { decideApproval, type Decision } from '@/state/approvals';
import { useLiveStore } from '@/state/store';
import { toast } from '@/state/toastStore';

interface Props {
  approval: Approval;
  selected?: boolean;
  /** Hides the context screenshot (used inline in the briefing). */
  compact?: boolean;
}

export function ApprovalCard({ approval, selected = false, compact = false }: Props) {
  const taskText = useLiveStore((s) => s.tasks[approval.taskId]?.text);
  const [imageFailed, setImageFailed] = useState(false);

  async function decide(decision: Decision) {
    try {
      await decideApproval(api, approval.id, decision);
    } catch {
      toast.error(
        `Could not ${decision === 'approve' ? 'approve' : 'deny'} that action. It is back in your list.`,
      );
    }
  }

  return (
    <article
      aria-label={approval.action.summary}
      data-selected={selected}
      className={`space-y-3 rounded-card border bg-surface p-4 ${
        selected ? 'border-status-needs ring-2 ring-status-needs/40' : 'border-status-needs/40'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-status-needs/15 px-2.5 py-0.5 font-medium text-status-needs">
          {categoryLabel[approval.action.category]}
        </span>
        <Link
          to={`/layers/${approval.layerId}`}
          className="inline-flex min-h-touch items-center rounded text-muted underline underline-offset-2 hover:text-ink"
        >
          {taskText ? `Layer: ${taskText}` : 'View layer'}
        </Link>
      </div>

      <p className="text-base font-medium leading-snug">
        {taskText ? `While working on “${taskText}”, the layer wants to: ` : 'The layer wants to: '}
        <span className="text-status-needs">{approval.action.summary}</span>
      </p>
      {approval.action.details && <p className="text-sm text-muted">{approval.action.details}</p>}

      {approval.screenshotUrl &&
        !compact &&
        (imageFailed ? (
          <p className="rounded-lg bg-raised p-3 text-sm text-muted">Screenshot unavailable.</p>
        ) : (
          <img
            src={approval.screenshotUrl}
            alt="What the layer was looking at when it asked"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="max-h-64 w-full rounded-lg border border-line object-cover object-top"
          />
        ))}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => void decide('deny')}
          className="min-h-[56px] rounded-xl border border-status-error/60 text-base font-semibold text-status-error hover:bg-status-error/10"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => void decide('approve')}
          className="min-h-[56px] rounded-xl bg-status-done text-base font-semibold text-bg hover:opacity-90"
        >
          Approve
        </button>
      </div>
    </article>
  );
}
