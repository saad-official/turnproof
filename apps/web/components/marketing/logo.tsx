/** The mark: a photo frame with a check through it. Colours follow the surrounding tokens. */
export function ProofMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" />
      <rect x="7" y="9" width="18" height="14" rx="3.5" fill="none" stroke="var(--tp-color-on-accent)" strokeWidth="2" />
      <path
        d="M11.5 16.2l3 3 6-6.4"
        fill="none"
        stroke="var(--tp-color-on-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-accent">
      <ProofMark />
      <span className="text-headline font-bold tracking-tight text-ink">Turnproof</span>
    </span>
  );
}
