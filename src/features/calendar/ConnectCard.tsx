export function ConnectCard({
  onConnect,
  connecting,
  waiting,
  onCancel,
  onRecheck,
  error,
  note,
}: {
  onConnect(): void;
  connecting: boolean;
  waiting: boolean;
  onCancel(): void;
  onRecheck(): void;
  error: string | null;
  /** Extra context shown under the explanation, e.g. why no events are visible. */
  note?: string;
}) {
  return (
    <section
      aria-labelledby="gc-connect-title"
      className="mx-auto max-w-lg rounded-card border border-line bg-surface p-6 text-center"
    >
      <h2 id="gc-connect-title" className="text-base font-semibold">
        Connect Google Calendar
      </h2>
      <p className="mt-2 text-sm text-muted">
        See your events here and let the agent plan around them. You sign in with Google in your
        browser; this app never sees your Google password or tokens.
      </p>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {waiting ? (
        <div role="status" className="mt-5 space-y-3">
          <p className="text-sm">Waiting for you to finish signing in with Google…</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onRecheck}
              className="min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
            >
              I’ve finished
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-touch rounded-lg px-4 text-sm text-muted hover:bg-raised hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className="mt-5 min-h-touch rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {connecting ? 'Opening Google…' : 'Connect Google Calendar'}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-status-error">
          {error}
        </p>
      )}
    </section>
  );
}
