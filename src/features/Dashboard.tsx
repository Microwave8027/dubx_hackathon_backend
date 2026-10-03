import { Panel } from '@/components/Panel';
import { useDashboardTab, type DashboardTab } from './useDashboardTab';
import { ApprovalsList } from './approvals/ApprovalsList';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { LayersPanel } from './layers/LayersPanel';
import { AddTask } from './tasks/AddTask';
import { TaskList } from './tasks/TaskList';

/** Phone: one panel at a time, chosen by the bottom tab bar. Mid: two columns. Wide: three. */
export function Dashboard() {
  const tab = useDashboardTab();
  const mid = useMediaQuery('(min-width: 800px)');
  // On phones only the active panel is mounted: no hidden live previews, and no hidden
  // approval list that keyboard shortcuts could act on.
  const show = (t: DashboardTab) => mid || tab === t;
  return (
    <div className="grid gap-6 mid:grid-cols-2 wide:grid-cols-3">
      <h1 className="sr-only">Dashboard</h1>
      {show('tasks') && (
        <Panel title="Tasks" className="mid:row-span-2 wide:row-span-1">
          <div className="mb-4">
            <AddTask />
          </div>
          <TaskList />
        </Panel>
      )}
      {show('layers') && (
        <Panel title="Layers">
          <LayersPanel />
        </Panel>
      )}
      {show('approvals') && (
        <Panel title="Approvals">
          <ApprovalsList />
        </Panel>
      )}
    </div>
  );
}
