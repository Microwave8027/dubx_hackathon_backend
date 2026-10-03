import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefingTimeField } from './BriefingTimeField';
import { ChronotypeQuestionnaire } from './ChronotypeQuestionnaire';
import { PeakWindowsEditor } from './PeakWindowsEditor';
import { TiersEditor } from './TiersEditor';
import { chronotypeLabel, scoreChronotype, suggestionFor } from './chronotype';
import { defaultProfile } from './defaults';
import { markOnboarded } from './onboarded';
import { useProfileSave } from './useProfileSave';
import { hasErrors, validateProfile } from './validate';

const STEPS = ['About you', 'Peak hours', 'Briefing and permissions'] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState(defaultProfile);
  const errors = useMemo(() => validateProfile(draft), [draft]);
  const result = scoreChronotype(answers);

  const save = useProfileSave(() => {
    markOnboarded();
    navigate('/', { replace: true });
  });

  function next() {
    if (step === 0 && result) {
      // The questionnaire result seeds the next steps; they stay fully editable.
      setDraft((d) => ({ ...d, chronotype: result, ...suggestionFor(result) }));
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function skip() {
    markOnboarded();
    navigate('/', { replace: true });
  }

  const last = step === STEPS.length - 1;

  return (
    <section aria-labelledby="onboarding-title" className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm text-muted" aria-live="polite">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <h1 id="onboarding-title" className="mt-1 text-xl font-semibold">
          {step === 0 && 'Let us learn your rhythm'}
          {step === 1 && `Your peak hours${result ? ` (${chronotypeLabel[result]})` : ''}`}
          {step === 2 && 'Briefing time and what the agent may do'}
        </h1>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-raised'}`}
            />
          ))}
        </div>
      </header>

      {step === 0 && (
        <ChronotypeQuestionnaire
          answers={answers}
          onAnswer={(q, o) => setAnswers((a) => ({ ...a, [q]: o }))}
        />
      )}
      {step === 1 && (
        <>
          <p className="text-sm text-muted">
            These are the hours you do your best work. Adjust anything that does not fit.
          </p>
          <PeakWindowsEditor
            windows={draft.peakWindows}
            errors={errors.windows}
            onChange={(peakWindows) => setDraft((d) => ({ ...d, peakWindows }))}
          />
        </>
      )}
      {step === 2 && (
        <div className="space-y-6">
          <BriefingTimeField
            value={draft.briefingTime}
            error={errors.briefingTime}
            onChange={(briefingTime) => setDraft((d) => ({ ...d, briefingTime }))}
          />
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Permissions
            </h2>
            <TiersEditor
              tiers={draft.tiers}
              onChange={(tiers) => setDraft((d) => ({ ...d, tiers }))}
            />
          </div>
        </div>
      )}

      <footer className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={skip}
          className="min-h-touch rounded-lg px-3 text-sm text-muted underline underline-offset-2 hover:text-ink"
        >
          Skip for now
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-touch rounded-lg bg-raised px-5 text-sm font-medium hover:bg-line"
            >
              Back
            </button>
          )}
          {last ? (
            <button
              type="button"
              onClick={() => save.mutate(draft)}
              disabled={hasErrors(errors) || save.isPending}
              className="min-h-touch rounded-lg bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Finish'}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={step === 0 ? !result : hasErrors(errors)}
              className="min-h-touch rounded-lg bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-50"
            >
              Next
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
