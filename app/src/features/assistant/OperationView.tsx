import type { Operation } from '@/assistant/types';
import { whenText } from '@/assistant/format';
import type { ScheduleEvent } from '@/calendar/types';

const label = { create: 'Add', update: 'Change', delete: 'Remove' } as const;

/** One proposed change. The kind is a word (Add, Change, Remove), never colour alone. */
export function OperationView({ op, existing }: { op: Operation; existing?: ScheduleEvent }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
          op.op === 'delete'
            ? 'bg-status-error/15 text-status-error'
            : op.op === 'update'
              ? 'bg-status-needs/15 text-status-needs'
              : 'bg-status-done/15 text-status-done'
        }`}
      >
        {label[op.op]}
      </span>
      <div className="min-w-0 text-sm">
        {op.op === 'delete' ? (
          <p className="font-semibold">
            {existing
              ? `${existing.title} · ${whenText(existing.start, existing.end)}`
              : 'An event outside the visible calendar'}
          </p>
        ) : (
          <>
            <p className="font-semibold">
              {op.color && (
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: op.color }}
                />
              )}
              {op.name} · {whenText(op.start, op.stop)}
            </p>
            {op.op === 'update' && existing && (
              <p className="text-xs text-muted">
                was {existing.title} · {whenText(existing.start, existing.end)}
              </p>
            )}
          </>
        )}
        {op.reason && <p className="text-xs text-muted">{op.reason}</p>}
      </div>
    </div>
  );
}
