export function EmptyExpenses({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <path d="M44 14h56v86l-8-6-7 6-7-6-7 6-7-6-8 6z" fill="var(--card)" />
      <path d="M56 38h32M56 52h24M56 66h16" />
      <path d="M120 22l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="var(--brand)" stroke="none" />
      <circle cx="30" cy="84" r="4" fill="var(--accent-teal)" stroke="none" />
    </svg>
  );
}
