import type { ApiClient } from '@/api/client';
import { useLiveStore } from './store';

export type Decision = 'approve' | 'deny';

/**
 * Optimistically resolves an approval, calls the API, and rolls back on failure.
 * The caller shows the error toast (the rejection is re-thrown).
 */
export async function decideApproval(
  client: Pick<ApiClient, 'approve' | 'deny'>,
  id: string,
  decision: Decision,
): Promise<void> {
  const rollback = useLiveStore
    .getState()
    .setApprovalStatus(id, decision === 'approve' ? 'approved' : 'denied');
  try {
    const updated = await (decision === 'approve' ? client.approve(id) : client.deny(id));
    useLiveStore.getState().applyEvent({ type: 'approval.resolved', data: updated });
  } catch (err) {
    rollback();
    throw err;
  }
}
