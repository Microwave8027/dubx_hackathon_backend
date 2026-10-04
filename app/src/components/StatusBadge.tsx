import type { Tone } from './statusTone';

const toneClass: Record<Tone, string> = {
  idle: 'bg-status-idle/15 text-status-idle',
  working: 'bg-status-working/15 text-status-working',
  needs: 'bg-status-needs/15 text-status-needs',
  done: 'bg-status-done/15 text-status-done',
  error: 'bg-status-error/15 text-status-error',
};

const dotClass: Record<Tone, string> = {
  idle: 'bg-status-idle',
  working: 'bg-status-working animate-pulse-soft',
  needs: 'bg-status-needs animate-pulse-soft',
  done: 'bg-status-done',
  error: 'bg-status-error',
};

/** Status is always shown as text as well as color. */
export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
      {label}
    </span>
  );
}
