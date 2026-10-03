export function NoRecurring({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <circle cx="80" cy="60" r="20" fill="var(--brand)" stroke="none" />
      <path d="M80 50v20M86 54h-8a4 4 0 000 8h4a4 4 0 010 8h-8" stroke="#fff" strokeWidth="3" />
      <path d="M40 60a40 40 0 0168-28M120 60a40 40 0 01-68 28" />
      <path d="M112 22l-3 12-12-3M48 98l3-12 12 3" />
    </svg>
  );
}
