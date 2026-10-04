import { categoryLabel } from '@/api/categories';
import { ACTION_CATEGORIES } from '@/api/schemas';
import type { ActionCategory, Profile, Tier } from '@/api/types';
import { isLocked } from './defaults';

const tierOptions: { value: Tier; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'ask', label: 'Ask me' },
  { value: 'never', label: 'Never' },
];

const hints: Record<ActionCategory, string> = {
  read_web: 'Browse and read pages.',
  write_files: 'Create or change files.',
  move_files: 'Move or rename files (can be undone).',
  delete_files: 'Remove files.',
  send_message: 'Send email or chat messages for you.',
  make_payment: 'Spend money.',
  install_software: 'Install apps or packages.',
  use_screen: 'Control your screen, mouse and keyboard.',
};

export function TiersEditor({
  tiers,
  onChange,
}: {
  tiers: Profile['tiers'];
  onChange(tiers: Profile['tiers']): void;
}) {
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {ACTION_CATEGORIES.map((c) => {
        const locked = isLocked(c);
        const current = locked ? 'never' : tiers[c];
        return (
          <li
            key={c}
            className="flex flex-col gap-2 p-3 mid:flex-row mid:items-center mid:justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {categoryLabel[c]}
                {locked && (
                  <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-xs font-normal text-muted">
                    Locked
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {locked ? `${hints[c]} Always off for your safety.` : hints[c]}
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label={`${categoryLabel[c]} permission`}
              className="flex shrink-0 overflow-hidden rounded-lg border border-line"
            >
              {tierOptions.map((o) => {
                const selected = current === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={locked}
                    onClick={() => onChange({ ...tiers, [c]: o.value })}
                    className={`min-h-touch flex-1 px-3 text-sm font-medium mid:flex-none ${
                      selected
                        ? o.value === 'never'
                          ? 'bg-status-error/20 text-status-error'
                          : o.value === 'auto'
                            ? 'bg-status-done/20 text-status-done'
                            : 'bg-accent/20 text-accent-ink'
                        : 'text-muted hover:bg-raised hover:text-ink'
                    } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
