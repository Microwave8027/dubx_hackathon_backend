import { ApprovalsList } from './ApprovalsList';

export function ApprovalsPage() {
  return (
    <section aria-labelledby="approvals-title" className="mx-auto max-w-2xl">
      <h1 id="approvals-title" className="mb-4 text-xl font-semibold">
        Approvals
      </h1>
      <ApprovalsList showResolved />
    </section>
  );
}
