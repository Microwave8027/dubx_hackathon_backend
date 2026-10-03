export function UsingScreenBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-status-needs/60 bg-status-needs/10 px-2.5 py-0.5 text-xs font-semibold text-status-needs">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
      Using your screen
    </span>
  );
}
