import { Panel } from '@/components/Panel';
import { useDashboardTab, type DashboardTab } from './useDashboardTab';
import { ApprovalsPanel } from './approvals/ApprovalsPanel';
import { LayersPanel } from './layers/LayersPanel';
import { AddTask } from './tasks/AddTask';
import { TaskList } from './tasks/TaskList';

/** Phone: one panel at a time, chosen by the bottom tab bar. Mid: two columns. Wide: three. */
export function Dashboard() {
  const tab = useDashboardTab();
  const show = (t: DashboardTab) => (tab === t ? 'block' : 'hidden mid:block');
  return (
    <div className="grid gap-6 mid:grid-cols-2 wide:grid-cols-3">
      <h1 className="sr-only">Dashboard</h1>
      <Panel title="Tasks" className={`${show('tasks')} mid:row-span-2 wide:row-span-1`}>
        <div className="mb-4">
          <AddTask />
        </div>
        <TaskList />
      </Panel>
      <Panel title="Layers" className={show('layers')}>
        <LayersPanel />
      </Panel>
      <Panel title="Approvals" className={show('approvals')}>
        <ApprovalsPanel />
      </Panel>
    </div>
  );
}
