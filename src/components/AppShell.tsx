import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { OnboardingGate } from '@/app/OnboardingGate';
import { PlatformBridge } from '@/app/PlatformBridge';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { ApprovalAnnouncer } from '@/features/approvals/ApprovalAnnouncer';
import { useDashboardTab } from '@/features/useDashboardTab';
import { useThemeStore } from '@/theme/themeStore';
import { ConnectionBanner } from './ConnectionBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { PendingBadge } from './PendingBadge';
import { Toaster } from './Toaster';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/approvals', label: 'Approvals', end: false, badge: true },
  { to: '/briefing', label: 'Briefing', end: false },
  { to: '/log', label: 'Activity', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'
  }`;

const tabs = [
  { to: '/?tab=tasks', label: 'Tasks', tab: 'tasks' },
  { to: '/?tab=layers', label: 'Layers', tab: 'layers' },
  { to: '/?tab=approvals', label: 'Approvals', tab: 'approvals', badge: true },
  { to: '/more', label: 'More', tab: null },
] as const;

function MobileTabBar() {
  const { pathname } = useLocation();
  const current = useDashboardTab();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] mid:hidden"
    >
      {tabs.map((t) => {
        const onDash = pathname === '/';
        const active =
          t.tab === 'tasks'
            ? onDash && current === 'tasks'
            : t.tab === 'layers'
              ? (onDash && current === 'layers') || pathname.startsWith('/layers/')
              : t.tab === 'approvals'
                ? (onDash && current === 'approvals') || pathname === '/approvals'
                : !onDash && pathname !== '/approvals' && !pathname.startsWith('/layers/');
        return (
          <NavLink
            key={t.label}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <span>{t.label}</span>
            {'badge' in t && <PendingBadge className="absolute right-[22%] top-1.5" />}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { theme, toggle } = useThemeStore();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  useDocumentTitle();

  // Move focus to the new screen on navigation so keyboard and screen-reader users are not
  // left on a link that no longer exists. Skipped on first load.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col mid:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-bg focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 mid:flex">
        <div className="px-3 py-3 text-base font-semibold">Command Center</div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              {n.label}
              {n.badge && <PendingBadge />}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={toggle}
          className="mt-auto min-h-touch rounded-lg px-3 text-left text-sm text-muted hover:bg-raised hover:text-ink"
        >
          {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 outline-none p-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] mid:p-6 mid:pb-6"
        >
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <MobileTabBar />
      <Toaster />
      <ApprovalAnnouncer />
      <PlatformBridge />
      <OnboardingGate />
    </div>
  );
}
