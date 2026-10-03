import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Placeholder } from '@/components/Placeholder';

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Placeholder title="Dashboard" note="Tasks, layers and approvals." />,
      },
      {
        path: 'layers/:layerId',
        element: <Placeholder title="Layer" note="Live preview, steps and log." />,
      },
      {
        path: 'approvals',
        element: <Placeholder title="Approvals" note="Decisions waiting on you." />,
      },
      {
        path: 'briefing',
        element: <Placeholder title="Briefing" note="Your morning and evening summary." />,
      },
      {
        path: 'log',
        element: <Placeholder title="Activity" note="Everything the agent did, with undo." />,
      },
      {
        path: 'settings',
        element: <Placeholder title="Settings" note="Schedule, permissions and connection." />,
      },
      {
        path: 'pair',
        element: <Placeholder title="Pair a phone" note="Scan the QR code to connect." />,
      },
      { path: '*', element: <Placeholder title="Not found" note="That page does not exist." /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
