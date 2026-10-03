import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Last line of defence: a render error in one screen must not blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md rounded-card border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">
          This screen hit an unexpected problem. Your tasks and approvals are safe on the agent.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-bg"
          >
            Reload
          </button>
          <a
            href="/"
            className="inline-flex min-h-touch items-center rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
