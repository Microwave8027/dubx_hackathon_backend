import { useId } from 'react';
import type { PeakWindow } from '@/api/types';
import { DAY_LABELS, defaultWindow } from './defaults';
import type { ProfileErrors } from './validate';

interface Props {
  windows: PeakWindow[];
  errors: ProfileErrors['windows'];
  onChange(windows: PeakWindow[]): void;
}

const timeInput =
  'min-h-touch rounded-lg border border-line bg-surface px-3 text-sm [color-scheme:inherit]';

function WindowRow({
  window: w,
  index,
  error,
  onChange,
  onRemove,
  canRemove,
}: {
  window: PeakWindow;
  index: number;
  error?: string;
  onChange(w: PeakWindow): void;
  onRemove(): void;
  canRemove: boolean;
}) {
  const id = useId();
  const toggleDay = (d: number) =>
    onChange({
      ...w,
      days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d].sort(),
    });
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-3">
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">Days for window {index + 1}</legend>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((label, d) => {
            const on = w.days.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(d)}
                className={`min-h-touch min-w-touch rounded-full border px-3 text-sm font-medium ${
                  on
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-start`} className="text-xs font-medium text-muted">
            From
          </label>
          <input
            id={`${id}-start`}
            type="time"
            value={w.start}
            onChange={(e) => onChange({ ...w, start: e.target.value })}
            className={timeInput}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-end`} className="text-xs font-medium text-muted">
            To
          </label>
          <input
            id={`${id}-end`}
            type="time"
            value={w.end}
            onChange={(e) => onChange({ ...w, end: e.target.value })}
            className={timeInput}
          />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto min-h-touch rounded-lg px-3 text-sm text-muted underline underline-offset-2 hover:text-ink"
          >
            Remove window {index + 1}
          </button>
        )}
      </div>
      {w.end < w.start && !error && (
        <p className="text-xs text-muted">This window runs past midnight into the next day.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      )}
    </li>
  );
}

export function PeakWindowsEditor({ windows, errors, onChange }: Props) {
  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label="Peak windows">
        {windows.map((w, i) => (
          <WindowRow
            key={i}
            window={w}
            index={i}
            error={errors[i]}
            canRemove={windows.length > 1}
            onChange={(next) => onChange(windows.map((x, j) => (j === i ? next : x)))}
            onRemove={() => onChange(windows.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...windows, defaultWindow()])}
        className="min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
      >
        Add another window
      </button>
    </div>
  );
}
