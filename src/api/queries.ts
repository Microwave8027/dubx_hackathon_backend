import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveStore } from '@/state/store';
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

// REST results hydrate the live store, so the UI works even before the WebSocket connects.
export function useTasksQuery() {
  const q = useQuery({ queryKey: queryKeys.tasks, queryFn: api.listTasks });
  useEffect(() => {
    if (q.data) useLiveStore.getState().hydrate({ tasks: q.data });
  }, [q.data]);
  return q;
}
export function useLayersQuery() {
  const q = useQuery({ queryKey: queryKeys.layers, queryFn: api.listLayers });
  useEffect(() => {
    if (q.data) useLiveStore.getState().hydrate({ layers: q.data });
  }, [q.data]);
  return q;
}
export function useApprovalsQuery() {
  const q = useQuery({ queryKey: queryKeys.approvals, queryFn: api.listApprovals });
  useEffect(() => {
    if (q.data) useLiveStore.getState().hydrate({ approvals: q.data });
  }, [q.data]);
  return q;
}
export const useProfileQuery = () =>
  useQuery({ queryKey: queryKeys.profile, queryFn: api.getProfile });
export const useLogQuery = (filter: LogFilter = {}) =>
  useQuery({ queryKey: queryKeys.log(filter), queryFn: () => api.listLog(filter) });
export const useBriefingQuery = () =>
  useQuery({ queryKey: queryKeys.briefing, queryFn: api.latestBriefing, retry: false });
