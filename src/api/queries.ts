import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { LogFilter } from './types';

export const queryKeys = {
  tasks: ['tasks'] as const,
  layers: ['layers'] as const,
  approvals: ['approvals'] as const,
  profile: ['profile'] as const,
  log: (filter: LogFilter) => ['log', filter] as const,
  briefing: ['briefing'] as const,
};

export const useTasksQuery = () => useQuery({ queryKey: queryKeys.tasks, queryFn: api.listTasks });
export const useLayersQuery = () =>
  useQuery({ queryKey: queryKeys.layers, queryFn: api.listLayers });
export const useApprovalsQuery = () =>
  useQuery({ queryKey: queryKeys.approvals, queryFn: api.listApprovals });
export const useProfileQuery = () =>
  useQuery({ queryKey: queryKeys.profile, queryFn: api.getProfile });
export const useLogQuery = (filter: LogFilter = {}) =>
  useQuery({ queryKey: queryKeys.log(filter), queryFn: () => api.listLog(filter) });
export const useBriefingQuery = () =>
  useQuery({ queryKey: queryKeys.briefing, queryFn: api.latestBriefing, retry: false });
