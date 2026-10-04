import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { OnboardingGate } from '@/app/OnboardingGate';
import { PlatformBridge } from '@/app/PlatformBridge';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import sunImprint from '@/assets/sun-imprint.png';
import { ApprovalAnnouncer } from '@/features/approvals/ApprovalAnnouncer';
import { useThemeStore } from '@/theme/themeStore';
import { ConnectionBanner } from './ConnectionBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { PendingBadge } from './PendingBadge';
import { Toaster } from './Toaster';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/calendar', label: 'Calendar', end: false },
  { to: '/approvals', label: 'Approvals', end: false, badge: true },
  { to: '/briefing', label: 'Briefing', end: false },
  { to: '/log', label: 'Activity', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch items-center justify-between rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'
  }`;

/** Two faint sun prints behind the content. Decorative only. */
function SunImprints() {
  const base =
    'pointer-events-none fixed bg-contain bg-center bg-no-repeat opacity-[var(--imprint-opacity)]';
  const image = { backgroundImage: `url(${sunImprint})` };
  return (
    <>
      <div
        aria-hidden="true"
        className={`${base} left-[-170px] top-[6vh] h-[500px] w-[520px] -rotate-12`}
        style={image}
      />
      <div
        aria-hidden="true"
        className={`${base} bottom-[-40px] right-[-190px] h-[538px] w-[560px] rotate-[14deg]`}
        style={image}
      />
    </>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const { theme, toggle } = useThemeStore();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          data-testid="menu-scrim"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-ink/30"
        />
      )}
      <aside
        id="app-menu"
        aria-label="Menu"
        // invisible removes the closed drawer from tab order and the accessibility tree.
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col gap-1 border-r border-line bg-surface p-3 transition-[transform,visibility] duration-[250ms] ease-out ${
          open ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-[105%]'
        }`}
      >
        <div className="flex items-center justify-between py-1 pl-3 pr-1">
          <span className="text-base font-semibold">Command Center</span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-muted hover:bg-raised hover:text-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass} onClick={onClose}>
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
    </>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  useDocumentTitle();

  const closeMenu = useCallback(() => {
    setMenuOpen((wasOpen) => {
      if (wasOpen) menuButton.current?.focus({ preventScroll: true });
      return false;
    });
  }, []);

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
    <div className="relative min-h-screen overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-on-accent focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <SunImprints />
      <button
        ref={menuButton}
        type="button"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="app-menu"
        onClick={() => setMenuOpen(true)}
        className="fixed left-4 top-4 z-20 flex h-11 w-11 flex-col items-center justify-center gap-[5px] rounded-xl border border-line bg-surface p-0 hover:bg-raised"
      >
        <span aria-hidden="true" className="h-0.5 w-[18px] rounded-sm bg-ink" />
        <span aria-hidden="true" className="h-0.5 w-[18px] rounded-sm bg-ink" />
        <span aria-hidden="true" className="h-0.5 w-[18px] rounded-sm bg-ink" />
      </button>
      <Drawer open={menuOpen} onClose={closeMenu} />
      <div className="relative flex min-w-0 flex-col">
        <div className="pl-[72px]">
          <ConnectionBanner />
        </div>
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 pb-12 pt-[88px] outline-none focus-visible:[box-shadow:none] mid:px-8"
        >
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <Toaster />
      <ApprovalAnnouncer />
      <PlatformBridge />
      <OnboardingGate />
    </div>
  );
}
