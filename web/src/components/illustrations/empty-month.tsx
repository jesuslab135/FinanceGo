export function EmptyMonth({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <rect x="30" y="26" width="100" height="78" rx="12" fill="var(--card)" />
      <path d="M30 48h100M56 16v20M104 16v20" />
      <circle cx="80" cy="78" r="16" fill="var(--accent-teal)" stroke="none" />
      <path d="M72 78l6 6 11-12" stroke="#fff" strokeWidth="3.5" />
    </svg>
  );
}
