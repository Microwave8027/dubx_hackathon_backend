import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { backend, errorMessage, type BackendStatus, type Session } from "./api";
import { BackendGate } from "./components/BackendGate";
import { Shell } from "./components/Shell";
import { SignIn } from "./components/SignIn";
import { Spinner } from "./components/ui";

// The app only runs against a live backend (normally the Docker Compose stack). Until it answers,
// BackendGate explains what to start; it comes back whenever the backend stops responding.
type Phase = { kind: "checking" } | { kind: "gate"; status: BackendStatus } | { kind: "ready" };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = useCallback(async () => {
    const status = await backend.status();
    if (status.state !== "ready") {
      setPhase({ kind: "gate", status });
      return;
    }
    setPhase({ kind: "ready" });
    setLoadError(null);
    try {
      setSession(await backend.getSession());
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    const subs = [
      // Rust drops the token when the backend rejects it.
      listen<string>("auth-expired", (e) => {
        setNotice(e.payload || "Your session expired. Sign in again.");
        setSession((s) => (s ? { ...s, user: null } : s));
      }),
      // A request couldn't connect (Docker stopped?): confirm, then show the gate.
      listen("backend-unreachable", async () => {
        const status = await backend.status();
        if (status.state !== "ready") setPhase({ kind: "gate", status });
      }),
    ];
    return () => subs.forEach((s) => void s.then((f) => f()));
  }, []);

  if (phase.kind === "gate") return <BackendGate initial={phase.status} onReady={start} />;
  if (loadError && !session) {
    return (
      <div className="splash splash-error">
        <div className="alert alert-error">{loadError}</div>
        <button className="btn" onClick={() => void start()}>
          Try again
        </button>
      </div>
    );
  }
  if (phase.kind === "checking" || !session) {
    return (
      <div className="splash">
        <Spinner /> Connecting to Dubx…
      </div>
    );
  }
  if (!session.user) {
    return (
      <SignIn
        backendUrl={session.backendUrl}
        notice={notice}
        onSession={setSession}
        onSignedIn={(user) => {
          setNotice(null);
          setSession((s) => (s ? { ...s, user } : s));
        }}
      />
    );
  }
  return (
    <Shell
      user={session.user}
      onSignedOut={() => setSession((s) => (s ? { ...s, user: null } : s))}
    />
  );
}
