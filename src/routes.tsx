import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { NotFound } from '@/components/NotFound';
import { Dashboard } from '@/features/Dashboard';
import { More } from '@/features/More';
import { BriefingPage } from '@/features/briefing/BriefingPage';
import { LogPage } from '@/features/log/LogPage';
import { PairingPage } from '@/features/pairing/PairingPage';
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
      { path: 'briefing', element: <BriefingPage /> },
      { path: 'log', element: <LogPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'pair', element: <PairingPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
