import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiUrl } from '@/api/config';
import { applyOperations, assist, AssistantError } from '@/assistant/api';
import { MAX_PROMPT, type Proposal } from '@/assistant/types';
import { CALENDAR_KEY, useCalendar } from '@/calendar/useCalendar';
import { toast } from '@/state/toastStore';
import { OperationView } from './OperationView';

const EXAMPLES = [
  'Move tomorrow’s gym session to 6pm',
  'Add 2 hours of deep work every weekday morning this week',
  'Clear my Friday afternoon',
  'Make every meeting this week 15 minutes shorter',
];

const btn =
  'min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line disabled:opacity-50';
const primary =
  'min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50';

/** Ask the AI to change your calendar. It proposes; nothing changes until you apply. */
export function AssistantPage() {
  const queryClient = useQueryClient();
  const calendar = useCalendar();
  const [prompt, setPrompt] = useState('');
  const [thinking, setThinking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<AssistantError | Error | null>(null);

  const byId = useMemo(
    () => new Map((calendar.data?.events ?? []).map((e) => [e.id, e])),
    [calendar.data],
  );
  const busy = thinking || applying;

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setThinking(true);
    setError(null);
    setProposal(null);
    try {
      const p = await assist(text);
      setProposal(p);
      setSelected(new Set(p.operations.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Something went wrong.'));
    } finally {
      setThinking(false);
    }
  }

  async function apply() {
    if (!proposal || applying) return;
    const ops = proposal.operations.filter((_, i) => selected.has(i));
    if (ops.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const results = await applyOperations(ops);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(
          `${results.length - failed.length} applied, ${failed.length} failed: ${failed[0]?.error ?? 'unknown error'}`,
        );
      } else {
        toast.info(
          `Applied ${results.length} change${results.length === 1 ? '' : 's'} to your calendar.`,
        );
      }
      // Whatever did apply is now on the calendar; refresh it either way.
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
      if (failed.length === 0) {
        setProposal(null);
        setPrompt('');
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Something went wrong.'));
    } finally {
      setApplying(false);
    }
  }

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask();
  };

  const signIn = error instanceof AssistantError && error.needsSignIn;
  const signInUrl = `${getApiUrl()}/auth/google`;

  return (
    <section aria-labelledby="assistant-title" className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 id="assistant-title" className="text-xl font-semibold">
          Assistant
        </h1>
        <p className="mt-1 text-sm text-muted">
          Describe how you want your schedule to change. The assistant suggests the edits; nothing
          changes until you apply them.
        </p>
      </div>

      <form onSubmit={ask} className="space-y-3 rounded-card border border-line bg-surface p-4">
        <label htmlFor="assistant-prompt" className="text-sm font-medium">
          What should change?
        </label>
        <textarea
          id="assistant-prompt"
          rows={3}
          value={prompt}
          maxLength={MAX_PROMPT}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKey}
          placeholder="e.g. Block out 9 to 11 every weekday for focused work and move my 1:1s to the afternoon"
          className="w-full rounded-lg border border-line bg-bg p-3 text-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className={`${btn} text-xs`}
              onClick={() => setPrompt(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Ctrl or ⌘ + Enter to send</span>
          <button type="submit" className={primary} disabled={busy || prompt.trim().length === 0}>
            {thinking ? 'Thinking…' : 'Suggest changes'}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {thinking && (
          <p role="status" className="text-sm text-muted">
            Reading your calendar and working out changes…
          </p>
        )}
      </div>

      {error && !signIn && (
        <p
          role="alert"
          className="rounded-card border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error"
        >
          {error.message}
        </p>
      )}

      {signIn && (
        <div
          role="alert"
          className="space-y-3 rounded-card border border-line bg-surface p-4 text-center"
        >
          <p className="font-medium">Sign in with Google to use the assistant.</p>
          <p className="text-sm text-muted">
            It needs your Google Calendar to read and change your events.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <a href={signInUrl} className={`${primary} inline-flex items-center`}>
              Sign in with Google
            </a>
            <button type="button" className={btn} onClick={() => void ask()}>
              I’ve signed in, try again
            </button>
          </div>
        </div>
      )}

      {proposal && (
        <section
          aria-labelledby="proposal-title"
          className="space-y-4 rounded-card border border-line bg-surface p-4"
        >
          <h2 id="proposal-title" className="text-base font-semibold">
            Suggested changes
          </h2>
          {proposal.summary && <p className="text-sm">{proposal.summary}</p>}
          {proposal.warnings.map((w) => (
            <p
              key={w}
              role="note"
              className="rounded-lg border border-status-needs/40 bg-status-needs/10 p-2 text-sm text-status-needs"
            >
              {w}
            </p>
          ))}
          {proposal.operations.length === 0 ? (
            <p className="text-sm text-muted">No changes needed.</p>
          ) : (
            <ul aria-label="Proposed changes" className="divide-y divide-line">
              {proposal.operations.map((op, i) => (
                <li key={i}>
                  <label className="flex min-h-touch cursor-pointer items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggle(i)}
                      className="mt-1 h-4 w-4 accent-accent"
                      aria-label={`Apply change ${i + 1}`}
                    />
                    <span className={selected.has(i) ? '' : 'opacity-50'}>
                      <OperationView
                        op={op}
                        existing={op.op === 'create' ? undefined : byId.get(op.id)}
                      />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => setProposal(null)}
              disabled={applying}
            >
              Discard
            </button>
            {proposal.operations.length > 0 && (
              <button
                type="button"
                className={primary}
                onClick={() => void apply()}
                disabled={applying || selected.size === 0}
              >
                {applying
                  ? 'Applying…'
                  : `Apply ${selected.size} change${selected.size === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
