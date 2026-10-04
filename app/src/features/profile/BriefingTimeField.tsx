import { useId } from 'react';

export function BriefingTimeField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange(value: string): void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Briefing time
      </label>
      <p className="text-xs text-muted">When your daily summary should be ready.</p>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className="min-h-touch w-40 rounded-lg border border-line bg-surface px-3 text-sm [color-scheme:inherit]"
      />
      {error && (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
