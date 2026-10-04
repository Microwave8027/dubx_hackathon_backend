import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { getPlatform, onPlatformEvent } from '@/platform';
import { selectPendingCount, useLiveStore } from '@/state/store';
import { selectTrayState } from '@/state/trayState';
import { toast } from '@/state/toastStore';

/** Connects the native shell (tray, notification clicks) to app state and routing. */
export function PlatformBridge() {
  const navigate = useNavigate();
  const trayState = useLiveStore(selectTrayState);

  useEffect(() => {
    getPlatform()
      .setTrayState(trayState)
      .catch(() => {
        /* tray unavailable; nothing to do */
      });
  }, [trayState]);

  useEffect(
    () =>
      onPlatformEvent((event) => {
        switch (event.type) {
          case 'deep-link':
            navigate(event.path);
            break;
          case 'tray-click':
            if (selectPendingCount(useLiveStore.getState()) > 0) navigate('/approvals');
            break;
          case 'pause-all': {
            const running = Object.values(useLiveStore.getState().layers).filter(
              (l) => l.status === 'running' || l.status === 'starting',
            );
            void Promise.allSettled(running.map((l) => api.pauseLayer(l.id))).then((results) => {
              const failed = results.filter((r) => r.status === 'rejected').length;
              if (failed > 0)
                toast.error(`Could not pause ${failed} layer${failed === 1 ? '' : 's'}.`);
            });
            break;
          }
        }
      }),
    [navigate],
  );

  return null;
}
