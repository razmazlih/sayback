type DurationUnit = 'minutes' | 'hours' | 'days';

/** Small, decorative time illustrations shared by presets and custom units. */
export function DurationIcon({ unit, multiple = false }: { unit: DurationUnit; multiple?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {unit === 'days' ? <>
        <rect x="4" y="5" width="16" height="16" rx="3" />
        <path d="M8 3v4m8-4v4M4 10h16" />
        {multiple ? <><path d="M8 14h1m3 0h1m3 0h1M8 17h1m3 0h1" /></> : <path d="m9 15 2 2 4-4" />}
      </> : <>
        <circle cx="12" cy="13" r="8" />
        {unit === 'minutes' ? <><path d="M10 2h4m-2 0v3m6 1 1.5-1.5M12 9v4l3-2" /><path d="M12 5a8 8 0 0 1 8 8" strokeWidth="2.5" /></> : <><path d="M12 8v5l3 2M12 5v1m8 7h-1m-7 8v-1m-8-7h1" /></>}
      </>}
    </svg>
  );
}
