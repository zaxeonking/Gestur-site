import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
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
  return <SyncedLyrics lines={result.lines} />
}

function SyncedLyrics({ lines }: { lines: { time: number; text: string }[] }) {
  const { currentTime, seekable } = usePlaybackTime()
  const { seekTo } = useAudioPlayer()
  const containerRef = useRef<HTMLDivElement>(null)
  const lastManualScroll = useRef(0)
  const active = useMemo(() => findActiveLine(lines, currentTime + 0.1), [lines, currentTime])

  useEffect(() => {
    const container = containerRef.current
    if (!container || active < 0) return
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_PAUSE_MS) return
    const node = container.querySelector<HTMLElement>(`[data-line="${active}"]`)
    if (!node) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({
      top: node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [active])

  const markManual = () => {
    lastManualScroll.current = Date.now()
  }

  return (
    <div
      ref={containerRef}
      onWheel={markManual}
      onTouchMove={markManual}
      className="relative h-full overflow-y-auto px-2 py-[30%] text-center"
    >
      {lines.map((line, i) => {
        const isActive = i === active
        const className = `block w-full rounded-md px-2 py-1.5 text-xl font-bold leading-snug transition-colors ${
          isActive ? 'text-ink' : i < active ? 'text-ink-muted/60' : 'text-ink-muted'
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
  )
}
