import type { TrayState } from '@/platform';
import type { LiveState } from './store';

/** needs-you beats working beats idle. Returns a primitive so selectors stay stable. */
export function selectTrayState(s: LiveState): TrayState {
  if (Object.values(s.approvals).some((a) => a.status === 'pending')) return 'needs-you';
  if (Object.values(s.layers).some((l) => l.status === 'running' || l.status === 'starting')) {
    return 'working';
  }
  return 'idle';
}
