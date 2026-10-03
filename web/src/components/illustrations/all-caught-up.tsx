export function AllCaughtUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <circle cx="80" cy="60" r="34" fill="var(--accent-teal)" stroke="none" />
      <path d="M64 61l12 12 21-24" stroke="#fff" strokeWidth="5" />
      <path d="M80 8v10M80 102v10M28 60H18M142 60h-10M43 23l7 7M117 97l-7-7M117 23l-7 7M43 97l7-7" />
    </svg>
  );
}
