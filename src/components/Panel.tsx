import { useId, type ReactNode } from 'react';

export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`min-w-0 ${className}`}>
      <div className="mb-3 flex min-h-touch items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
