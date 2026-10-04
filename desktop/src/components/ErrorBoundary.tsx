import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shows a render error instead of an empty window (React unmounts everything on an uncaught error). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dubx UI crashed:", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="signin">
        <div className="signin-card">
          <h1>Something went wrong</h1>
          <p className="muted">The Dubx window hit an error. Reloading usually fixes it; if it keeps happening, copy the details below.</p>
          <pre className="command crash">{`${error.message}\n\n${error.stack ?? ""}`}</pre>
          <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
