import { Link } from 'react-router-dom';
import { useThemeStore } from '@/theme/themeStore';

const links = [
  { to: '/briefing', label: 'Briefing', hint: 'Your morning and evening summary' },
  { to: '/log', label: 'Activity log', hint: 'Everything the agent did, with undo' },
  { to: '/settings', label: 'Settings', hint: 'Schedule, permissions, connection' },
  { to: '/pair', label: 'Pair a phone', hint: 'Scan a QR code' },
];

export function More() {
  const { theme, toggle } = useThemeStore();
  return (
    <section aria-labelledby="more-title">
      <h1 id="more-title" className="mb-4 text-xl font-semibold">
        More
      </h1>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="block min-h-touch rounded-card border border-line bg-surface p-3 hover:bg-raised"
            >
              <span className="block text-sm font-medium">{l.label}</span>
              <span className="block text-xs text-muted">{l.hint}</span>
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={toggle}
            className="block min-h-touch w-full rounded-card border border-line bg-surface p-3 text-left text-sm font-medium hover:bg-raised"
          >
            {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          </button>
        </li>
      </ul>
    </section>
  );
}
