import type { Approval, Layer, Step, Task } from '@/api/types';
import type { PlanetStatus, WidgetData } from '../planets';

export interface PreviewItem {
  id: string;
  text: string;
  weight: Task['weight'];
  status: PlanetStatus;
  stepsDone: number;
  stepsTotal: number;
}

const STEP_TEXTS = [
  'Reading files',
  'Collecting totals',
  'Writing the summary',
  'Checking the numbers',
  'Saving the result',
  'Sending it over',
];
const TASK_TEXTS = [
  'Summarise this week’s receipts',
  'Draft a reply to the landlord',
  'Sort the downloads folder',
  'Book the dentist',
  'Compare phone plans',
  'Back up the photos',
  'Renew the car insurance',
  'Plan next week’s meals',
];
const CYCLE: PlanetStatus[] = ['running', 'waiting_approval', 'running', 'paused', 'starting'];

export const INITIAL_ITEMS: PreviewItem[] = [
  {
    id: '1',
    text: TASK_TEXTS[0]!,
    weight: 'routine',
    status: 'running',
    stepsDone: 2,
    stepsTotal: 5,
  },
  {
    id: '2',
    text: TASK_TEXTS[1]!,
    weight: 'judgment',
    status: 'waiting_approval',
    stepsDone: 1,
    stepsTotal: 3,
  },
  {
    id: '3',
    text: TASK_TEXTS[2]!,
    weight: 'routine',
    status: 'running',
    stepsDone: 4,
    stepsTotal: 6,
  },
];

/** The nth task to add (n starts at 1): varied status, weight and progress. */
export function makeItem(n: number): PreviewItem {
  const stepsTotal = 3 + (n % 4);
  return {
    id: String(n),
    text: TASK_TEXTS[(n - 1) % TASK_TEXTS.length]!,
    weight: n % 3 === 0 ? 'judgment' : 'routine',
    status: CYCLE[(n - 1) % CYCLE.length]!,
    stepsDone: n % stepsTotal,
    stepsTotal,
  };
}

const pad = (n: string) => n.padStart(2, '0');

/** Builds the same store shape the real widget reads, so the preview exercises the real selectors. */
export function toWidgetData(items: PreviewItem[]): WidgetData {
  const tasks: Record<string, Task> = {};
  const layers: Record<string, Layer> = {};
  const approvals: Record<string, Approval> = {};
  for (const item of items) {
    tasks[item.id] = {
      id: item.id,
      text: item.text,
      status: item.status === 'waiting_approval' ? 'waiting_approval' : 'running',
      weight: item.weight,
      createdAt: `2026-01-01T00:00:${pad(item.id)}Z`,
    };
    const steps: Step[] = Array.from({ length: item.stepsTotal }, (_, i) => ({
      id: `${item.id}-s${i}`,
      text: STEP_TEXTS[i % STEP_TEXTS.length]!,
      status: i < item.stepsDone ? 'done' : i === item.stepsDone ? 'active' : 'pending',
    }));
    const layerId = `l${item.id}`;
    layers[layerId] = {
      id: layerId,
      taskId: item.id,
      status: item.status,
      steps,
      usesScreen: false,
    };
    if (item.status === 'waiting_approval') {
      approvals[`a${item.id}`] = {
        id: `a${item.id}`,
        layerId,
        taskId: item.id,
        action: { category: 'send_message', summary: 'Send a message' },
        status: 'pending',
        createdAt: `2026-01-01T00:01:${pad(item.id)}Z`,
      };
    }
  }
  return { tasks, layers, approvals };
}
