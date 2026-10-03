export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="text-xl font-semibold">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </section>
  );
}
