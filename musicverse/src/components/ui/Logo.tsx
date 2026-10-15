export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <g fill="#1DB954">
          <rect x="6" y="14" width="3.5" height="8" rx="1.75" />
          <rect x="11.5" y="9" width="3.5" height="18" rx="1.75" />
          <rect x="17" y="5" width="3.5" height="22" rx="1.75" />
          <rect x="22.5" y="11" width="3.5" height="12" rx="1.75" />
        </g>
      </svg>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink">
        MusicVerse
      </span>
    </div>
  )
}
