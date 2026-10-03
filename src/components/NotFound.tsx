import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section aria-labelledby="nf-title" className="mx-auto max-w-md">
      <h1 id="nf-title" className="text-xl font-semibold">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted">That page does not exist.</p>
      <Link to="/" className="mt-3 inline-flex min-h-touch items-center text-accent-ink underline">
        Back to the dashboard
      </Link>
    </section>
  );
}
