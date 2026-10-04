import { useEffect, useState } from "react";
import { backend, errorMessage, type BackendStatus } from "../api";
import { ServerSettings } from "./SignIn";
import { Spinner } from "./ui";

const RECHECK_MS = 3000;

const COPY: Record<Exclude<BackendStatus["state"], "ready">, { title: string; body: string; command?: string }> = {
  dockerStopped: {
    title: "Start Docker Desktop",
    body: "The Dubx backend runs in Docker. Open Docker Desktop and the dubx containers start on their own.",
  },
  unreachable: {
    title: "Waiting for the Dubx backend",
    body: "Nothing is answering yet. If Docker Desktop just started, give it a moment. Otherwise start the containers from the dubx_backend folder:",
    command: "docker compose up -d",
  },
  outdated: {
    title: "Your backend container is out of date",
    body: "The running image predates the desktop features. Rebuild it from the dubx_backend folder:",
    command: "docker compose up -d --build",
  },
};

/** Shown until the backend is up; re-checks on its own and calls onReady once it is. */
export function BackendGate({ initial, onReady }: { initial: BackendStatus; onReady: () => void }) {
  const [status, setStatus] = useState(initial);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let alive = true;
    const timer = setInterval(async () => {
      const next = await backend.status();
      if (!alive) return;
      if (next.state === "ready") onReady();
      else setStatus(next);
    }, RECHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [onReady]);

  if (status.state === "ready") return null;
  const copy = COPY[status.state];
  // A remote backend isn't Docker on this machine, so only the generic message applies.
  const body = status.local ? copy.body : `Can't reach ${status.backendUrl}. Check that the server is running.`;

  async function openDocker() {
    setError(null);
    setOpening(true);
    try {
      await backend.openDocker();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTimeout(() => setOpening(false), 5000);
    }
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand brand-lg">
          <span className="brand-mark" />
          Dubx
        </div>
        <h1>{copy.title}</h1>
        <p className="muted">{body}</p>
        {status.local && copy.command && <code className="command">{copy.command}</code>}
        {error && <div className="alert alert-error">{error}</div>}

        {status.state === "dockerStopped" && status.local && (
          <button className="btn btn-primary btn-lg" onClick={openDocker} disabled={opening}>
            {opening ? "Starting Docker Desktop…" : "Open Docker Desktop"}
          </button>
        )}
        <div className="waiting-line muted">
          <Spinner /> Checking {status.backendUrl} every few seconds…
        </div>

        <button className="link" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Hide server settings" : "Server settings"}
        </button>
        {showSettings && (
          <ServerSettings
            initialUrl={status.backendUrl}
            onSaved={async () => {
              const next = await backend.status();
              if (next.state === "ready") onReady();
              else setStatus(next);
            }}
          />
        )}
      </div>
    </div>
  );
}
