import { Panel } from '@/components/Panel';
import { selectPendingCount, useLiveStore } from '@/state/store';
import { ApprovalsList } from './approvals/ApprovalsList';
import { InstallGuide } from './install/InstallGuide';
import { LayersPanel } from './layers/LayersPanel';
import { AddTask } from './tasks/AddTask';
import { TaskList } from './tasks/TaskList';

function Count({ n }: { n: number }) {
  return (
    <span className="text-xs text-muted" aria-hidden="true">
      {n}
    </span>
  );
}

/** Tasks, Layers and Approvals side by side; columns wrap to one on a phone. */
export function Dashboard() {
  const tasks = useLiveStore((s) => Object.keys(s.tasks).length);
  const layers = useLiveStore((s) => Object.keys(s.layers).length);
  const pending = useLiveStore(selectPendingCount);
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-10">
      <h1 className="sr-only">Dashboard</h1>
      <div className="col-span-full empty:hidden mid:hidden">
        <InstallGuide dismissible />
      </div>
      <Panel title="Tasks" action={<Count n={tasks} />}>
        <div className="mb-4">
          <AddTask />
        </div>
        <TaskList />
      </Panel>
      <Panel title="Layers" action={<Count n={layers} />}>
        <LayersPanel />
      </Panel>
      <Panel title="Approvals" action={<Count n={pending} />}>
        <ApprovalsList />
      </Panel>
    </div>
  );
}
