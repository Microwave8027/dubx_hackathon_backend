import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { queryKeys } from '@/api/queries';
import { useSpeech } from '@/hooks/useSpeech';
import { useLiveStore } from '@/state/store';
import { toast } from '@/state/toastStore';

export function AddTask() {
  const [text, setText] = useState('');
  const baseRef = useRef('');
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: api.createTask,
    onSuccess: (task) => {
      useLiveStore.getState().applyEvent({ type: 'task.updated', data: task });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      setText('');
    },
    onError: () => toast.error('Could not add the task. Your text is still in the box.'),
  });

  const speech = useSpeech((spoken) => {
    setText([baseRef.current, spoken].filter(Boolean).join(' ').trim());
  });

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || create.isPending) return;
    create.mutate({ text: value });
  }

  function onMic() {
    if (!speech.listening) baseRef.current = text.trim();
    speech.toggle();
  }

  return (
    <form onSubmit={submit} className="flex gap-2" aria-label="Add task">
      <label htmlFor="new-task" className="sr-only">
        What should the agent do?
      </label>
      <input
        id="new-task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What should the agent do?"
        autoComplete="off"
        className="min-h-touch min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
      />
      {speech.supported && (
        <button
          type="button"
          onClick={onMic}
          aria-pressed={speech.listening}
          aria-label={speech.listening ? 'Stop dictation' : 'Dictate a task'}
          className={`min-h-touch min-w-touch rounded-lg border px-3 text-sm ${
            speech.listening
              ? 'border-status-error bg-status-error/15 text-status-error'
              : 'border-line bg-surface text-muted hover:text-ink'
          }`}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="mx-auto h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      )}
      <button
        type="submit"
        disabled={!text.trim() || create.isPending}
        className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {create.isPending ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}
