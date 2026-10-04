import { useState } from "react";
import { backend, errorMessage, type Session, type User } from "../api";
import { Spinner } from "./ui";

export function SignIn({
  backendUrl,
  notice,
  onSession,
  onSignedIn,
}: {
  backendUrl: string;
  notice: string | null;
  onSession: (s: Session) => void;
  onSignedIn: (u: User) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  async function signIn() {
    setError(null);
    setWaiting(true);
    try {
      onSignedIn(await backend.signIn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWaiting(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand brand-lg">
          <span className="brand-mark" />
          Dubx
        </div>
        <h1>Your calendar, your workspace.</h1>
        <p className="muted">
          Dubx reads your Google Calendar, remembers which apps belong to each block, and swaps
          them in when the next block starts.
        </p>

        {(error || notice) && <div className="alert alert-error">{error ?? notice}</div>}

        {waiting ? (
          <div className="waiting">
            <Spinner />
            <div>
              <strong>Finish signing in in your browser</strong>
              <p className="muted">We opened Google's sign-in page. Come back here when you're done.</p>
            </div>
            <button className="btn" onClick={() => void backend.cancelSignIn()}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-google btn-lg" onClick={signIn}>
            <GoogleLogo /> Sign in with Google
          </button>
        )}

        <ul className="signin-points">
          <li>Calendar access lets Dubx read and edit your events.</li>
          <li>Your sign-in is kept in Windows Credential Manager, not in a file.</li>
        </ul>

        <button className="link" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Hide server settings" : "Server settings"}
        </button>
        {showSettings && (
          <ServerSettings
            initialUrl={backendUrl}
            onSaved={(session) => {
              onSession(session);
              if (session.user) onSignedIn(session.user);
              setShowSettings(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Backend URL form. The default matches the Docker Compose stack on this machine. */
export function ServerSettings({
  initialUrl,
  onSaved,
}: {
  initialUrl: string;
  onSaved: (s: Session) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      onSaved(await backend.setBackendUrl(url));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <div className="settings">
        <label>
          Backend URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000" />
        </label>
        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </form>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
