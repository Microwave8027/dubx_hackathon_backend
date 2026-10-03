import { useSearchParams } from 'react-router-dom';

export type DashboardTab = 'tasks' | 'layers' | 'approvals';
const tabs: DashboardTab[] = ['tasks', 'layers', 'approvals'];

export function useDashboardTab(): DashboardTab {
  const [params] = useSearchParams();
  const t = params.get('tab');
  return tabs.find((x) => x === t) ?? 'tasks';
}
