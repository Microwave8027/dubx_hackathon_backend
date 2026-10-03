import { z } from 'zod';
import {
  ApprovalSchema,
  ApprovalsSchema,
  BriefingSchema,
  LayerSchema,
  LayersSchema,
  LogEntrySchema,
  LogSchema,
  PairingStartSchema,
  ProfileSchema,
  TaskSchema,
  TasksSchema,
  VapidKeySchema,
} from './schemas';
import type { LogFilter, NewTask, Profile, TaskPatch } from './types';
import { getApiUrl } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Fetch = typeof fetch;

export function createApiClient(baseUrl: () => string = getApiUrl, fetchImpl: Fetch = fetch) {
  async function request<T>(
    schema: z.ZodType<T>,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetchImpl(`${baseUrl()}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(`${method} ${path} failed (${res.status})`, res.status);
    const json: unknown = res.status === 204 ? null : await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(`Unexpected response from ${method} ${path}`, res.status);
    }
    return parsed.data;
  }
  const none = z.unknown();

  return {
    listTasks: () => request(TasksSchema, 'GET', '/tasks'),
    createTask: (task: NewTask) => request(TaskSchema, 'POST', '/tasks', task),
    patchTask: (id: string, patch: TaskPatch) =>
      request(TaskSchema, 'PATCH', `/tasks/${encodeURIComponent(id)}`, patch),
    listLayers: () => request(LayersSchema, 'GET', '/layers'),
    pauseLayer: (id: string) =>
      request(LayerSchema, 'POST', `/layers/${encodeURIComponent(id)}/pause`),
    resumeLayer: (id: string) =>
      request(LayerSchema, 'POST', `/layers/${encodeURIComponent(id)}/resume`),
    killLayer: (id: string) =>
      request(LayerSchema, 'POST', `/layers/${encodeURIComponent(id)}/kill`),
    redirectLayer: (id: string, instruction: string) =>
      request(LayerSchema, 'POST', `/layers/${encodeURIComponent(id)}/redirect`, { instruction }),
    listApprovals: () => request(ApprovalsSchema, 'GET', '/approvals'),
    approve: (id: string) =>
      request(ApprovalSchema, 'POST', `/approvals/${encodeURIComponent(id)}/approve`),
    deny: (id: string) =>
      request(ApprovalSchema, 'POST', `/approvals/${encodeURIComponent(id)}/deny`),
    getProfile: () => request(ProfileSchema, 'GET', '/profile'),
    putProfile: (profile: Profile) => request(ProfileSchema, 'PUT', '/profile', profile),
    listLog: (filter: LogFilter = {}) => {
      const q = new URLSearchParams();
      if (filter.layerId) q.set('layerId', filter.layerId);
      if (filter.category) q.set('category', filter.category);
      const qs = q.toString();
      return request(LogSchema, 'GET', `/log${qs ? `?${qs}` : ''}`);
    },
    latestBriefing: () => request(BriefingSchema, 'GET', '/briefing/latest'),
    // Proposed additions, not in the default contract.
    undoLogEntry: (id: string) =>
      request(LogEntrySchema, 'POST', `/log/${encodeURIComponent(id)}/undo`),
    getVapidKey: () => request(VapidKeySchema, 'GET', '/push/vapid-key'),
    subscribePush: (subscription: unknown) =>
      request(none, 'POST', '/push/subscribe', subscription),
    startPairing: () => request(PairingStartSchema, 'POST', '/pairing/start'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export const api: ApiClient = createApiClient();
