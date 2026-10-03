import { NavLink, Outlet } from 'react-router-dom';
import { useThemeStore } from '@/theme/themeStore';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/approvals', label: 'Approvals', end: false },
  { to: '/briefing', label: 'Briefing', end: false },
  { to: '/log', label: 'Activity', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-touch items-center rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'
  }`;

export function AppShell() {
  const { theme, toggle } = useThemeStore();
  return (
    <div className="flex min-h-screen flex-col mid:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 mid:flex">
        <div className="px-3 py-3 text-base font-semibold">Command Center</div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              {n.label}
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
      <main id="main" className="min-w-0 flex-1 p-4 pb-24 mid:p-6 mid:pb-6">
        <Outlet />
      </main>
    </div>
  );
}
