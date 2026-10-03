import { z } from 'zod';

export const ACTION_CATEGORIES = [
  'read_web',
  'write_files',
  'move_files',
  'delete_files',
  'send_message',
  'make_payment',
  'install_software',
  'use_screen',
] as const;
export const ActionCategorySchema = z.enum(ACTION_CATEGORIES);

export const TaskStatusSchema = z.enum([
  'queued',
  'scheduled',
  'running',
  'waiting_approval',
  'done',
  'failed',
  'cancelled',
]);
export const TaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: TaskStatusSchema,
  weight: z.enum(['routine', 'judgment']),
  layerId: z.string().optional(),
  scheduledFor: z.string().optional(),
  createdAt: z.string(),
  result: z.object({ summary: z.string(), files: z.array(z.string()) }).optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['pending', 'active', 'done', 'failed']),
});
export const LayerStatusSchema = z.enum([
  'starting',
  'running',
  'paused',
  'waiting_approval',
  'done',
  'error',
  'killed',
]);
export const LayerSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: LayerStatusSchema,
  steps: z.array(StepSchema),
  usesScreen: z.boolean(),
});

export const ApprovalSchema = z.object({
  id: z.string(),
  layerId: z.string(),
  taskId: z.string(),
  action: z.object({
    category: ActionCategorySchema,
    summary: z.string(),
    details: z.string().optional(),
  }),
  status: z.enum(['pending', 'approved', 'denied', 'expired']),
  screenshotUrl: z.string().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
});

export const LogEntrySchema = z.object({
  id: z.string(),
  layerId: z.string(),
  ts: z.string(),
  category: ActionCategorySchema,
  summary: z.string(),
  reversible: z.boolean(),
  undone: z.boolean().optional(),
});

const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
export const PeakWindowSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)),
  start: HHmm,
  end: HHmm,
});
export const TierSchema = z.enum(['auto', 'ask', 'never']);
export const ProfileSchema = z.object({
  chronotype: z.enum(['morning', 'night', 'neutral']),
  peakWindows: z.array(PeakWindowSchema),
  briefingTime: HHmm,
  tiers: z.record(ActionCategorySchema, TierSchema),
});

// Not in the default contract: assumed shape, flagged in the PR.
export const BriefingSchema = z.object({
  id: z.string(),
  kind: z.enum(['morning', 'evening']),
  generatedAt: z.string(),
  summary: z.string(),
  finished: z.array(
    z.object({ taskId: z.string(), text: z.string(), summary: z.string().optional() }),
  ),
  approvalIds: z.array(z.string()),
});

export const FrameSchema = z.object({
  layerId: z.string(),
  ts: z.number(),
  jpegBase64: z.string(),
});

export const PairingStartSchema = z.object({
  url: z.string(),
  expiresAt: z.string().optional(),
});
export const VapidKeySchema = z.object({ publicKey: z.string() });

export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task.updated'), data: TaskSchema }),
  z.object({ type: z.literal('layer.updated'), data: LayerSchema }),
  z.object({ type: z.literal('layer.frame'), data: FrameSchema }),
  z.object({ type: z.literal('approval.requested'), data: ApprovalSchema }),
  z.object({ type: z.literal('approval.resolved'), data: ApprovalSchema }),
  z.object({ type: z.literal('briefing.ready'), data: BriefingSchema }),
  // The calendar payload is deliberately opaque here; src/calendar/normalize.ts owns its shape.
  z.object({ type: z.literal('calendar.snapshot'), data: z.unknown() }),
  z.object({ type: z.literal('calendar.updated'), data: z.unknown().optional() }),
]);

export const TasksSchema = z.array(TaskSchema);
export const LayersSchema = z.array(LayerSchema);
export const ApprovalsSchema = z.array(ApprovalSchema);
export const LogSchema = z.array(LogEntrySchema);
