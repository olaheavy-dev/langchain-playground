type IconProps = { className?: string };

const base = "size-[18px] shrink-0";

export function WeatherIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`} aria-hidden="true">
      <path d="M17.5 18.5H7a4 4 0 0 1-.6-7.96 5.5 5.5 0 0 1 10.7-1.2 3.9 3.9 0 0 1 .4 9.16Z" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`} aria-hidden="true">
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z" />
    </svg>
  );
}

export function StreamIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`} aria-hidden="true">
      <path d="M4 8h9M4 12h14M4 16h7" />
      <circle cx="19.5" cy="16" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" className={`size-4 shrink-0 ${className ?? ""}`} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M18.4 5.6l-1.1 1.1M6.7 17.3l-1.1 1.1" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" stroke="currentColor"
         strokeLinecap="round" strokeLinejoin="round" className={`size-4 shrink-0 ${className ?? ""}`} aria-hidden="true">
      <path d="M20 14.2A8 8 0 1 1 9.8 4a6.5 6.5 0 0 0 10.2 10.2Z" />
    </svg>
  );
}

export function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={`size-7 shrink-0 ${className ?? ""}`} aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <path
        d="M8.5 18.5V9.5M8.5 9.5h4.2a3 3 0 0 1 0 6H8.5M16.8 18.5c2.6 0 4.2-1.7 4.2-4.2"
        stroke="var(--accent-contrast)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
