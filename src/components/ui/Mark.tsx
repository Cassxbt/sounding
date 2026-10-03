/** A plumb line with its lead, and the return ping: what a sounding is. */
export function Mark({ size = 22, live = false }: { size?: number; live?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      {live && <span className="ping absolute inset-[30%] rounded-full border border-sea" />}
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 2.5v11" />
        <path d="M9.6 13.5h4.8l-1 5.2a1.4 1.4 0 0 1-2.8 0z" fill="currentColor" stroke="none" />
        <path d="M5 16.5a8.5 8.5 0 0 0 14 0" className="text-sea" stroke="currentColor" opacity="0.9" />
        <path d="M2.5 13.5a11.5 11.5 0 0 0 19 0" className="text-sea" stroke="currentColor" opacity="0.4" />
      </svg>
    </span>
  );
}
