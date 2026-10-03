import { useState } from 'react';
import { isIos, isStandalone, promptInstall, useCanPromptInstall } from '@/pwa/installPrompt';
import { detectTauri } from '@/platform';

const DISMISS_KEY = 'cc.installDismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function ShareIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="inline h-4 w-4 align-text-bottom"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * Install affordance: a button where the browser supports beforeinstallprompt, and a clear
 * "Add to Home Screen" card on iOS (push there only works from the installed app).
 */
export function InstallGuide({ dismissible = false }: { dismissible?: boolean }) {
  const canPrompt = useCanPromptInstall();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (detectTauri() || isStandalone() || (dismissible && dismissed)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  const close = dismissible && (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss install tip"
      className="min-h-touch min-w-touch shrink-0 rounded text-muted hover:text-ink"
    >
      ×
    </button>
  );

  if (canPrompt) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3">
        <div>
          <p className="text-sm font-medium">Install Command Center</p>
          <p className="text-xs text-muted">Open it like an app and get notifications.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-bg"
          >
            Install
          </button>
          {close}
        </div>
      </div>
    );
  }

  if (isIos()) {
    return (
      <section
        aria-label="Add to Home Screen"
        className="rounded-card border border-status-working/40 bg-surface p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">Add to Home Screen</h2>
          {close}
        </div>
        <p className="mt-1 text-sm text-muted">
          On iPhone and iPad, notifications only work once this app is on your Home Screen.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap the Share button <ShareIcon /> in the toolbar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
          <li>Open Command Center from your Home Screen and turn on notifications.</li>
        </ol>
      </section>
    );
  }

  return null;
}
