type IconProps = {
  className?: string;
};

export function IconOverview({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 4h7v9H4V4Zm9 0h7v6h-7V4ZM4 15h7v5H4v-5Zm9-3h7v8h-7v-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDevices({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 17.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconEmployees({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 18.5c.6-3 2.5-4.5 4.5-4.5s3.9 1.5 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.5" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19.8 18.5c-.4-2.2-1.8-3.4-3.3-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconAttendance({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3.2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20 5v5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

export function IconSearch({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

export function IconEdit({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="m4.5 16.5-.8 3.8 3.8-.8L18 9l-3-3L4.5 16.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="m13.5 7.5 3 3" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

export function IconTrash({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l.7 13h8.6L17 7M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function IconLists({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>;
}

export function IconDownload({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function IconFile({ className }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden><path d="M7 3.5h7l3.5 3.5v13.5H7V3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5V7h3.5M9.5 11h5M9.5 14h5M9.5 17h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}
