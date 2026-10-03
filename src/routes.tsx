import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Placeholder } from '@/components/Placeholder';
import { Dashboard } from '@/features/Dashboard';
import { More } from '@/features/More';
import { OnboardingPage } from '@/features/profile/OnboardingPage';
import { SettingsPage } from '@/features/profile/SettingsPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { LayerDetail } from '@/features/layers/LayerDetail';

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'more', element: <More /> },
      { path: 'layers/:layerId', element: <LayerDetail /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      {
        path: 'briefing',
        element: <Placeholder title="Briefing" note="Your morning and evening summary." />,
      },
      {
        path: 'log',
        element: <Placeholder title="Activity" note="Everything the agent did, with undo." />,
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      {
        path: 'pair',
        element: <Placeholder title="Pair a phone" note="Scan the QR code to connect." />,
      },
      { path: '*', element: <Placeholder title="Not found" note="That page does not exist." /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
