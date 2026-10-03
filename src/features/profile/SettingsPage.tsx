import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useProfileQuery } from '@/api/queries';
import { PanelState } from '@/components/PanelState';
import { PushToggle } from '@/features/install/PushToggle';
import { detectTauri } from '@/platform';
import { useThemeStore } from '@/theme/themeStore';
import { BriefingTimeField } from './BriefingTimeField';
import { ConnectionSection } from './ConnectionSection';
import { PeakWindowsEditor } from './PeakWindowsEditor';
import { TiersEditor } from './TiersEditor';
import { WidgetSection } from './WidgetSection';
import { chronotypeLabel } from './chronotype';
import { sanitizeProfile } from './defaults';
import { hasErrors, validateProfile } from './validate';
import { useProfileSave } from './useProfileSave';
import type { Profile } from '@/api/types';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ProfileForm({ initial }: { initial: Profile }) {
  const [saved, setSaved] = useState(() => sanitizeProfile(initial));
  const [draft, setDraft] = useState(saved);
  const { theme, setTheme } = useThemeStore();
  const save = useProfileSave((p) => {
    const clean = sanitizeProfile(p);
    setSaved(clean);
    setDraft(clean);
  });
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const errors = useMemo(() => validateProfile(draft), [draft]);
  const patch = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="space-y-8">
      <Section
        title="Schedule"
        hint="The agent saves heavier work for your peak hours and has your briefing ready on time."
      >
        <p className="text-sm">
          Chronotype: <strong>{chronotypeLabel[draft.chronotype]}</strong>{' '}
          <Link to="/onboarding" className="ml-1 text-accent-ink underline underline-offset-2">
            Retake the questionnaire
          </Link>
        </p>
        <PeakWindowsEditor
          windows={draft.peakWindows}
          errors={errors.windows}
          onChange={(peakWindows) => patch({ peakWindows })}
        />
        <BriefingTimeField
          value={draft.briefingTime}
          error={errors.briefingTime}
          onChange={(briefingTime) => patch({ briefingTime })}
        />
      </Section>

      <Section
        title="Permissions"
        hint="Choose what the agent may do by itself, what needs your OK, and what is off limits."
      >
        <TiersEditor tiers={draft.tiers} onChange={(tiers) => patch({ tiers })} />
      </Section>

      <Section title="Appearance">
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex overflow-hidden rounded-lg border border-line"
        >
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={`min-h-touch px-5 text-sm font-medium capitalize ${
                theme === t
                  ? 'bg-accent/20 text-accent-ink'
                  : 'text-muted hover:bg-raised hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      {detectTauri() && (
        <Section
          title="Desktop widget"
          hint="A small sun in the corner of your screen while the Command Center window is closed. Saved on this computer."
        >
          <WidgetSection />
        </Section>
      )}

      {!detectTauri() && (
        <Section title="Notifications">
          <PushToggle />
        </Section>
      )}

      <Section title="Connection">
        <ConnectionSection />
      </Section>

      {dirty && (
        <div className="sticky bottom-20 z-30 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-lg mid:bottom-4">
          <p className="text-sm text-muted" aria-live="polite">
            {hasErrors(errors)
              ? 'Fix the highlighted settings to save.'
              : 'You have unsaved changes.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(saved)}
              className="min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => save.mutate(draft)}
              disabled={hasErrors(errors) || save.isPending}
              className="min-h-touch rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const query = useProfileQuery();
  return (
    <section aria-labelledby="settings-title" className="mx-auto max-w-2xl">
      <h1 id="settings-title" className="mb-6 text-xl font-semibold">
        Settings
      </h1>
      <PanelState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!query.data}
        emptyTitle="No settings found"
      >
        {query.data && <ProfileForm initial={query.data} />}
      </PanelState>
      {query.error && (
        <div className="mt-8">
          <Section
            title="Connection"
            hint="You can still change where the app looks for the agent."
          >
            <ConnectionSection />
          </Section>
        </div>
      )}
    </section>
  );
}
