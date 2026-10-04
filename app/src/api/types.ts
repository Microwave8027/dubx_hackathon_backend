import type { z } from 'zod';
import type * as s from './schemas';

export type ActionCategory = z.infer<typeof s.ActionCategorySchema>;
export type TaskStatus = z.infer<typeof s.TaskStatusSchema>;
export type Task = z.infer<typeof s.TaskSchema>;
export type Step = z.infer<typeof s.StepSchema>;
export type LayerStatus = z.infer<typeof s.LayerStatusSchema>;
export type Layer = z.infer<typeof s.LayerSchema>;
export type Approval = z.infer<typeof s.ApprovalSchema>;
export type LogEntry = z.infer<typeof s.LogEntrySchema>;
export type PeakWindow = z.infer<typeof s.PeakWindowSchema>;
export type Tier = z.infer<typeof s.TierSchema>;
export type Profile = z.infer<typeof s.ProfileSchema>;
export type Briefing = z.infer<typeof s.BriefingSchema>;
export type Frame = z.infer<typeof s.FrameSchema>;
export type PairingStart = z.infer<typeof s.PairingStartSchema>;
export type ServerEvent = z.infer<typeof s.ServerEventSchema>;

export interface NewTask {
  text: string;
  weight?: Task['weight'];
  scheduledFor?: string;
}
export type TaskPatch = Partial<Pick<Task, 'text' | 'status' | 'scheduledFor'>>;
export interface LogFilter {
  layerId?: string;
  category?: ActionCategory;
}
