export function NoCards({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <rect x="40" y="20" width="96" height="62" rx="10" fill="var(--brand)" stroke="none" />
      <rect x="24" y="40" width="96" height="62" rx="10" fill="var(--card)" />
      <path d="M24 58h96" strokeWidth="6" />
      <path d="M36 84h24" />
      <circle cx="104" cy="86" r="5" fill="var(--accent-teal)" stroke="none" />
    </svg>
  );
}
