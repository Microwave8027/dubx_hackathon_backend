import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPlatform } from '@/platform';
import { CALENDAR_KEY } from './useCalendar';
import {
  disconnectGoogle,
  getGoogleStatus,
  isSafeAuthUrl,
  startGoogleConnect,
  type GoogleStatus,
} from './google';

export const GOOGLE_KEY = ['google-calendar-link'] as const;
const POLL_MS = 2000;
/** How long we wait for the user to finish the Google consent page in their browser. */
const WAIT_LIMIT_MS = 2 * 60_000;

/** `unknown` = the status endpoint is not there (backend not integrated); show the calendar anyway. */
export type LinkState = 'connected' | 'disconnected' | 'unknown' | 'loading';

export function useGoogleLink() {
  const queryClient = useQueryClient();
  const [waitingRaw, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = useQuery<GoogleStatus>({
    queryKey: GOOGLE_KEY,
    queryFn: getGoogleStatus,
    retry: false,
    refetchInterval: (q) => (waitingRaw && !q.state.data?.connected ? POLL_MS : false),
  });
  // Waiting ends by itself as soon as the backend says connected.
  const waiting = waitingRaw && !status.data?.connected;

  const stopWaiting = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setWaiting(false);
  }, []);

  // The consent happens in the browser; once the backend reports connected, load the calendar.
  useEffect(() => {
    if (status.data?.connected) {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    }
  }, [status.data?.connected, queryClient]);

  useEffect(() => () => stopWaiting(), [stopWaiting]);

  const connect = useMutation({
    mutationFn: startGoogleConnect,
    onMutate: () => setError(null),
    onSuccess: async (result) => {
      if (result.connected) {
        await queryClient.invalidateQueries({ queryKey: GOOGLE_KEY });
        return;
      }
      if (!result.authUrl || !isSafeAuthUrl(result.authUrl)) {
        setError('Google sign-in could not be started. Try again.');
        return;
      }
      await getPlatform().openExternal(result.authUrl);
      setWaiting(true);
      timeout.current = setTimeout(() => {
        setWaiting(false);
        setError(
          'Still waiting for Google. If you finished signing in, check the connection again.',
        );
      }, WAIT_LIMIT_MS);
    },
    onError: () => setError('Could not reach the agent to start Google sign-in.'),
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: GOOGLE_KEY });
      queryClient.removeQueries({ queryKey: CALENDAR_KEY });
    },
    onError: () => setError('Could not disconnect. Try again.'),
  });

  let state: LinkState;
  if (status.data) state = status.data.connected ? 'connected' : 'disconnected';
  else if (status.isError) state = 'unknown';
  else state = 'loading';

  return {
    state,
    account: status.data?.account ?? null,
    waiting,
    error,
    connect: () => connect.mutate(),
    connecting: connect.isPending,
    cancelWaiting: stopWaiting,
    disconnect: () => disconnect.mutate(),
    disconnecting: disconnect.isPending,
    recheck: () => void status.refetch(),
  };
}
