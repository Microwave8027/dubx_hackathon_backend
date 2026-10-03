import type { Step } from '@/api/types';

const icon: Record<Step['status'], { glyph: string; cls: string; label: string }> = {
  pending: { glyph: '○', cls: 'text-muted', label: 'Pending' },
  active: { glyph: '●', cls: 'text-status-working animate-pulse-soft', label: 'In progress' },
  done: { glyph: '✓', cls: 'text-status-done', label: 'Done' },
  failed: { glyph: '✕', cls: 'text-status-error', label: 'Failed' },
};

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1.5" aria-label="Steps">
      {steps.map((s) => (
        <li
          key={s.id}
          aria-current={s.status === 'active' ? 'step' : undefined}
          className="flex items-start gap-2 text-sm"
        >
          <span aria-hidden className={`w-4 shrink-0 text-center ${icon[s.status].cls}`}>
            {icon[s.status].glyph}
          </span>
          <span className="sr-only">{icon[s.status].label}: </span>
          <span className={s.status === 'pending' ? 'text-muted' : ''}>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}
