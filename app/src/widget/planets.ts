import type { Approval, Layer, LayerStatus, Task } from '@/api/types';
import type { TrayState, WidgetTarget } from '@/platform';

export const MAX_PLANETS = 7;

/** Planet radius in canvas px by task weight: judgment tasks are larger. */
export const PLANET_RADIUS = { routine: 9, judgment: 13 } as const;

export type PlanetStatus = Extract<
  LayerStatus,
  'starting' | 'running' | 'paused' | 'waiting_approval'
>;
const PLANET_STATUSES: readonly LayerStatus[] = [
  'starting',
  'running',
  'paused',
  'waiting_approval',
];

export interface Planet {
  /** The layer id; one planet per layer. */
  id: string;
  layerId: string;
  taskId: string;
  text: string;
  status: PlanetStatus;
  weight: Task['weight'];
  stepsDone: number;
  stepsTotal: number;
  /** stepsDone / stepsTotal, 0 when there are no steps. */
  progress: number;
  currentStep?: string;
  /** The oldest pending approval for this layer, if any. */
  approvalId?: string;
  radius: number;
}

export interface PlanetSelection {
  planets: Planet[];
  /** Planets beyond MAX_PLANETS, shown as one "+N" planet. */
  overflow: number;
  /** Planets before the cap; the widget's "active tasks" count. */
  total: number;
}

export interface WidgetData {
  tasks: Record<string, Task>;
  layers: Record<string, Layer>;
  approvals: Record<string, Approval>;
}

/** needs-you first, then what is working, then paused work. */
const RANK: Record<PlanetStatus, number> = {
  waiting_approval: 0,
  running: 1,
  starting: 2,
  paused: 3,
};

export function progressOf(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, done / total));
}

export function planetRadius(weight: Task['weight']): number {
  return PLANET_RADIUS[weight];
}

function currentStepOf(layer: Layer): string | undefined {
  return (
    layer.steps.find((s) => s.status === 'active')?.text ??
    layer.steps.find((s) => s.status === 'pending')?.text
  );
}

export function selectPlanets(data: WidgetData, max: number = MAX_PLANETS): PlanetSelection {
  const pendingByLayer = new Map<string, Approval>();
  for (const a of Object.values(data.approvals)) {
    if (a.status !== 'pending') continue;
    const existing = pendingByLayer.get(a.layerId);
    if (!existing || a.createdAt < existing.createdAt) pendingByLayer.set(a.layerId, a);
  }

  const all: Array<{ planet: Planet; createdAt: string }> = [];
  for (const layer of Object.values(data.layers)) {
    if (!PLANET_STATUSES.includes(layer.status)) continue;
    const task = data.tasks[layer.taskId];
    const approval = pendingByLayer.get(layer.id);
    const stepsDone = layer.steps.filter((s) => s.status === 'done').length;
    const weight = task?.weight ?? 'routine';
    all.push({
      createdAt: task?.createdAt ?? '',
      planet: {
        id: layer.id,
        layerId: layer.id,
        taskId: layer.taskId,
        text: task?.text ?? 'Untitled task',
        // A pending approval means the layer needs the user, whatever the layer status says yet.
        status: approval ? 'waiting_approval' : (layer.status as PlanetStatus),
        weight,
        stepsDone,
        stepsTotal: layer.steps.length,
        progress: progressOf(stepsDone, layer.steps.length),
        currentStep: currentStepOf(layer),
        approvalId: approval?.id,
        radius: planetRadius(weight),
      },
    });
  }

  all.sort(
    (a, b) =>
      RANK[a.planet.status] - RANK[b.planet.status] ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.planet.id.localeCompare(b.planet.id),
  );
  const planets = all.slice(0, max).map((x) => x.planet);
  return { planets, overflow: Math.max(0, all.length - max), total: all.length };
}

/** Same vocabulary as the tray: needs-you beats working beats idle. */
export function sunState(data: WidgetData): TrayState {
  if (Object.values(data.approvals).some((a) => a.status === 'pending')) return 'needs-you';
  const { planets } = selectPlanets(data, Number.POSITIVE_INFINITY);
  if (planets.some((p) => p.status === 'waiting_approval')) return 'needs-you';
  if (planets.some((p) => p.status === 'running' || p.status === 'starting')) return 'working';
  return 'idle';
}

/**
 * The widget never changes colour with state. Only attention changes how it looks: it flashes and
 * shows a number. One fixed palette, matching the red-to-orange orb.
 */
export const ORB = { core: '#e8281a', mid: '#f0502a', edge: '#ffa132' } as const;

/** True when the widget should flash and show a count. */
export const needsAttention = (state: TrayState): boolean => state === 'needs-you';

/** The number to show: pending approvals, or waiting planets if the approvals have not arrived. */
export function attentionCount(pendingApprovals: number, selection: PlanetSelection): number {
  if (pendingApprovals > 0) return pendingApprovals;
  return selection.planets.filter((p) => p.status === 'waiting_approval').length;
}

/** A planet opens its layer, or the approval when it is waiting on one. */
export function planetTarget(planet: Planet): WidgetTarget {
  return planet.status === 'waiting_approval' && planet.approvalId
    ? { approvalId: planet.approvalId }
    : { layerId: planet.layerId };
}

const STATUS_TEXT: Record<PlanetStatus, string> = {
  starting: 'Starting',
  running: 'Running',
  paused: 'Paused',
  waiting_approval: 'Waiting for approval',
};
export const planetStatusText = (status: PlanetStatus): string => STATUS_TEXT[status];

/** "Step 2 of 4: Collecting files", or a count when no step is current. */
export function planetStepText(planet: Planet): string {
  if (planet.stepsTotal === 0) return 'No steps yet';
  if (!planet.currentStep) return `${planet.stepsDone} of ${planet.stepsTotal} steps done`;
  return `Step ${Math.min(planet.stepsDone + 1, planet.stepsTotal)} of ${planet.stepsTotal}: ${planet.currentStep}`;
}
