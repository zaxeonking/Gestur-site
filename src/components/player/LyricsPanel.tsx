import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import type { LyricsState } from '../../hooks/useLyrics'
import { findActiveLine } from '../../utils/lrc'

/** Setelah pengguna menggulir sendiri, sorotan otomatis tidak menarik layar selama jeda ini. */
const MANUAL_SCROLL_PAUSE_MS = 4000

interface LyricsPanelProps {
  state: LyricsState
  onRetry: () => void
}

function Message({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-ink-muted">{children}</div>
}

/**
 * Lirik di pemutar penuh. Lirik bertanda waktu (synced): baris yang sedang dinyanyikan disorot dan
 * digulirkan ke tengah; ketuk baris untuk loncat ke bagian itu (jika audio bisa di-seek).
 * Lirik tanpa waktu tampil sebagai teks biasa.
 */
export default function LyricsPanel({ state, onRetry }: LyricsPanelProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <Message>
        <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <p role="status">Mencari lirik…</p>
      </Message>
    )
  }
  if (state.status === 'error') {
    return (
      <Message>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={onRetry} className="btn-secondary h-10 px-5">
          Coba lagi
        </button>
      </Message>
    )
  }
  const { result } = state
  if (result.kind === 'none') return <Message>Lirik untuk lagu ini tidak ditemukan.</Message>
  if (result.kind === 'instrumental') return <Message>Lagu ini instrumental, tidak ada lirik.</Message>
  if (result.kind === 'plain') {
    return (
      <div className="h-full overflow-y-auto px-2 py-4 text-center">
        {result.lines.map((line, i) => (
          <p key={i} className="min-h-[1.5em] text-lg font-medium leading-relaxed text-ink">
            {line}
          </p>
        ))}
        <p className="pt-6 text-[11px] text-ink-faint">Lirik dari LRCLIB</p>
      </div>
    )
  }
  return <SyncedLyrics lines={result.lines} lyricsDuration={result.duration} />
}

/** Selisih durasi (detik) yang masih dianggap versi audio yang sama, dan batas di mana waktu lirik tidak bisa dipercaya. */
const TIMING_WARN_S = 4
const TIMING_UNUSABLE_S = 15
const OFFSET_STEP_S = 0.5
/** Pudar di tepi atas/bawah kotak supaya baris seolah muncul dan hilang saat bergulir naik. */
const FADE_MASK = {
  maskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
} as const

function SyncedLyrics({ lines, lyricsDuration }: { lines: { time: number; text: string }[]; lyricsDuration: number | null }) {
  const { currentTime, seekable, duration: audioDuration } = usePlaybackTime()
  const { seekTo } = useAudioPlayer()
  const containerRef = useRef<HTMLDivElement>(null)
  const lastManualScroll = useRef(0)
  // Geser manual: positif = lirik muncul lebih awal, negatif = lebih lambat.
  const [offset, setOffset] = useState(0)
  const diff = lyricsDuration !== null && audioDuration !== null ? Math.abs(lyricsDuration - audioDuration) : 0
  const timingUnusable = diff > TIMING_UNUSABLE_S
  const timingWarn = diff > TIMING_WARN_S
  const active = useMemo(() => findActiveLine(lines, currentTime + offset + 0.1), [lines, currentTime, offset])

  useEffect(() => {
    const container = containerRef.current
    if (!container || active < 0 || timingUnusable) return
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_PAUSE_MS) return
    const node = container.querySelector<HTMLElement>(`[data-line="${active}"]`)
    if (!node) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({
      top: node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [active, timingUnusable])

  const markManual = () => {
    lastManualScroll.current = Date.now()
  }

  // Versi audio terlalu beda dari versi lirik: waktunya pasti meleset, jadi tampilkan teks biasa.
  if (timingUnusable) {
    return (
      <div className="h-full overflow-y-auto px-2 py-4 text-center">
        <p role="status" className="pb-3 text-xs text-ink-faint">
          Durasi audio ({Math.round(audioDuration ?? 0)} dtk) jauh beda dari versi lirik ({Math.round(lyricsDuration ?? 0)} dtk),
          jadi lirik ditampilkan tanpa sorotan waktu.
        </p>
        {lines.map((line, i) => (
          <p key={i} className="min-h-[1.5em] text-lg font-medium leading-relaxed text-ink">
            {line.text}
          </p>
        ))}
        <p className="pt-6 text-[11px] text-ink-faint">Lirik dari LRCLIB</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        onWheel={markManual}
        onTouchMove={markManual}
        style={FADE_MASK}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-[38%] text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lines.map((line, i) => {
          const isActive = i === active
          const className = `block w-full origin-center rounded-md px-1 py-1.5 text-lg font-bold leading-snug transition-all duration-300 ${
            isActive ? 'scale-105 text-ink' : i < active ? 'text-white/30' : 'text-white/50'
          }`
          const text = line.text || '♪'
          return seekable ? (
            <button
              key={i}
              type="button"
              data-line={i}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => seekTo(line.time)}
              className={`${className} focus-ring`}
            >
              {text}
            </button>
          ) : (
            <p key={i} data-line={i} aria-current={isActive ? 'true' : undefined} className={className}>
              {text}
            </p>
          )
        })}
        <p className="pt-6 text-[11px] text-ink-faint">Lirik dari LRCLIB</p>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2 text-[11px] text-ink-muted">
        {timingWarn && <span role="status">Waktu kurang pas.</span>}
        <button
          type="button"
          onClick={() => setOffset((v) => Math.round((v - OFFSET_STEP_S) * 10) / 10)}
          aria-label="Lirik lebih lambat 0,5 detik"
          className="h-7 rounded-full border border-white/20 px-2.5 focus-ring active:bg-white/10"
        >
          Lambat
        </button>
        <span className="min-w-[3rem] tabular-nums" aria-live="polite">
          {offset > 0 ? '+' : ''}
          {offset.toFixed(1)} dtk
        </span>
        <button
          type="button"
          onClick={() => setOffset((v) => Math.round((v + OFFSET_STEP_S) * 10) / 10)}
          aria-label="Lirik lebih cepat 0,5 detik"
          className="h-7 rounded-full border border-white/20 px-2.5 focus-ring active:bg-white/10"
        >
          Cepat
        </button>
      </div>
    </div>
  )
}
