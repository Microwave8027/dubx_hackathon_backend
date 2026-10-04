import { useEffect, useRef, useState } from 'react';
import { usePendingApprovals } from '@/state/store';

/** Screen-reader announcement (aria-live) whenever a new approval arrives, on any screen. */
export function ApprovalAnnouncer() {
  const pending = usePendingApprovals();
  const seen = useRef<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fresh = pending.filter((a) => !seen.current.has(a.id));
    seen.current = new Set(pending.map((a) => a.id));
    const first = fresh[0];
    if (!first) return;
    setMessage(
      fresh.length === 1
        ? `New approval needed: ${first.action.summary}`
        : `${fresh.length} new approvals needed. First: ${first.action.summary}`,
    );
  }, [pending]);

  return (
    <div role="status" aria-live="polite" aria-atomic className="sr-only">
      {message}
    </div>
  );
}
