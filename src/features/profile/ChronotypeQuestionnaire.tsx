import { QUESTIONS, chronotypeLabel, scoreChronotype } from './chronotype';

export function ChronotypeQuestionnaire({
  answers,
  onAnswer,
}: {
  answers: Record<string, number>;
  onAnswer(questionId: string, optionIndex: number): void;
}) {
  const result = scoreChronotype(answers);
  return (
    <div className="space-y-4">
      {QUESTIONS.map((q, qi) => (
        <fieldset key={q.id} className="rounded-card border border-line bg-surface p-4">
          <legend className="float-left mb-2 w-full text-sm font-medium">
            {qi + 1}. {q.text}
          </legend>
          <div className="clear-both space-y-1">
            {q.options.map((o, oi) => (
              <label
                key={o.label}
                className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-raised"
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === oi}
                  onChange={() => onAnswer(q.id, oi)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p aria-live="polite" className="text-sm text-muted">
        {result ? (
          <>
            You look like a <strong className="text-ink">{chronotypeLabel[result]}</strong>. We will
            suggest peak hours to match.
          </>
        ) : (
          'Answer all four questions to see your result.'
        )}
      </p>
    </div>
  );
}
