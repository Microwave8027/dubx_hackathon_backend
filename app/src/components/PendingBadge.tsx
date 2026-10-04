import { selectPendingCount, useLiveStore } from '@/state/store';

export function PendingBadge({ className = '' }: { className?: string }) {
  const count = useLiveStore(selectPendingCount);
  if (count === 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-status-needs px-1.5 text-xs font-semibold text-bg ${className}`}
      aria-label={`${count} pending ${count === 1 ? 'approval' : 'approvals'}`}
    >
      {count}
    </span>
  );
}
