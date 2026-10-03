import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider } from '@/api/RealtimeProvider';
import { registerServiceWorker } from '@/pwa/register';
import { createRouter } from '@/routes';
import { applyTheme, useThemeStore } from '@/theme/themeStore';
import './index.css';

applyTheme(useThemeStore.getState().theme);
registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <RouterProvider router={createRouter()} />
      </RealtimeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
