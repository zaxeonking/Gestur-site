import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import type { LyricsState } from '../../hooks/useLyrics'
import type { LyricsResult } from '../../services/lyricsApi'
import { estimateActive, useLyricTiming, type LyricItem as Item } from '../../hooks/useLyricTiming'
import { useLongPress } from '../../hooks/useLongPress'
import { removeKey, writeJson } from '../../utils/safeStorage'

interface LyricsPanelProps {
  state: LyricsState
  onRetry: () => void
  /** Identitas lagu (judul|artis) untuk menyimpan penyelarasan manual per lagu. */
  trackKey?: string
}

function Message({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-ink-muted">{children}</div>
}

/** Pudar di tepi atas/bawah kotak supaya baris seolah muncul dan hilang saat bergulir naik. */
const FADE_MASK = {
  maskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
} as const

/**
 * Lirik di pemutar penuh. SELALU bergerak mengikuti lagu:
 *  - bertanda waktu + durasi cocok  → sorotan memakai waktu aslinya,
 *  - bertanda waktu + durasi agak beda → waktu diregangkan sesuai rasio durasi,
 *  - tanpa waktu / waktu tak bisa dipercaya → sorotan PERKIRAAN menurut progres lagu.
 * Ketuk baris (jika audio bisa di-seek) untuk loncat ke bagian itu, hanya pada mode berwaktu.
 */
export default function LyricsPanel({ state, onRetry, trackKey }: LyricsPanelProps) {
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
  if (result.kind === 'plain') return <PlainLyrics lines={result.lines} />
  return <SyncedLyrics result={result} trackKey={trackKey} />
}

/** Satu baris lirik. Tahan lama = "baris ini yang sedang dinyanyikan sekarang" (penyelarasan manual). */
function Row({ item, state, onSeek, onCalibrate, index }: { item: Item; state: 'active' | 'past' | 'next'; onSeek?: (time: number) => void; onCalibrate?: (item: Item) => void; index: number }) {
  const handlers = useLongPress(() => {
    if (onCalibrate && item.time !== undefined) onCalibrate(item)
  })
  const className = `block w-full origin-center select-none rounded-md px-1 py-1.5 text-xl font-bold leading-snug transition-all duration-300 ${
    state === 'active' ? 'scale-105 text-ink' : state === 'past' ? 'text-white/30' : 'text-white/50'
  }`
  const text = item.text || '♪'
  const common = {
    'data-line': index,
    'aria-current': state === 'active' ? ('true' as const) : undefined,
    ...(onCalibrate ? handlers : {}),
  }
  return onSeek && item.time !== undefined ? (
    <button type="button" {...common} onClick={() => onSeek(item.time as number)} className={`${className} focus-ring`}>
      {text}
    </button>
  ) : (
    <p {...common} className={className}>
      {text}
    </p>
  )
}

/** Daftar baris yang menggulir baris aktif ke tengah (selalu, setiap baris aktif berganti). */
function LineList({
  items,
  active,
  onSeek,
  onCalibrate,
  header,
}: {
  items: Item[]
  active: number
  onSeek?: (time: number) => void
  onCalibrate?: (item: Item) => void
  header?: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || active < 0) return
    const node = container.querySelector<HTMLElement>(`[data-line="${active}"]`)
    if (!node) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({
      top: node.offsetTop - container.clientHeight / 2 + node.clientHeight / 2,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [active, items])

  return (
    <div className="flex h-full flex-col">
      {header && <div className="shrink-0 px-4 pt-2 text-center text-[11px] text-ink-faint">{header}</div>}
      <div
        ref={containerRef}
        style={FADE_MASK}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-[18dvh] text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <Row key={i} index={i} item={item} state={i === active ? 'active' : i < active ? 'past' : 'next'} onSeek={onSeek} onCalibrate={onCalibrate} />
        ))}
        <p className="pt-6 text-[11px] text-ink-faint">Lirik dari LRCLIB / NetEase</p>
      </div>
    </div>
  )
}

const ESTIMATE_NOTE = 'Waktu lirik tidak tersedia, sorotan hanya perkiraan.'

function PlainLyrics({ lines }: { lines: string[] }) {
  const { currentTime, duration } = usePlaybackTime()
  const items = useMemo<Item[]>(() => lines.map((text) => ({ text })), [lines])
  const active = estimateActive(items, currentTime, duration)
  return <LineList items={items} active={active} header={ESTIMATE_NOTE} />
}

function SyncedLyrics({ result, trackKey }: { result: Extract<LyricsResult, { kind: 'synced' }>; trackKey?: string }) {
  const { items, active, mode, offset, setOffset, ratio, lyricTime, lyricsDuration, audioDuration, seekable, storageKey } = useLyricTiming(result, trackKey)
  const { seekTo } = useAudioPlayer()

  const modeNote =
    mode === 'estimated'
      ? `Durasi audio (${Math.round(audioDuration ?? 0)} dtk) jauh beda dari versi lirik (${Math.round(lyricsDuration ?? 0)} dtk), sorotan hanya perkiraan.`
      : mode === 'scaled'
        ? 'Durasi audio agak beda dari versi lirik, waktu disesuaikan.'
        : null

  // Tahan baris yang SEDANG terdengar dinyanyikan -> lirik diselaraskan ke titik itu.
  // Dikurangi ±0,75 dtk: waktu tahan (0,45 dtk) + waktu reaksi, karena baris itu sudah mulai sebelum jari menahan.
  const onCalibrate =
    mode === 'estimated'
      ? undefined
      : (item: Item) => {
          if (item.time === undefined) return
          const next = Math.round((item.time + 0.75 - lyricTime) * 10) / 10
          setOffset(next)
          if (storageKey) writeJson(storageKey, next)
        }
  const resetOffset = () => {
    setOffset(0)
    if (storageKey) removeKey(storageKey)
  }

  const header: ReactNode =
    mode === 'estimated' ? (
      modeNote
    ) : offset !== 0 ? (
      <span>
        Diselaraskan {offset > 0 ? '+' : ''}
        {offset.toFixed(1)} dtk ·{' '}
        <button type="button" onClick={resetOffset} className="font-semibold text-accent underline focus-ring">
          Reset
        </button>
      </span>
    ) : (
      (modeNote ?? 'Lirik tidak pas? Tahan baris yang sedang dinyanyikan.')
    )

  // Loncat ke baris hanya akurat pada mode berwaktu; waktu lirik dikonversi balik ke waktu audio.
  const onSeek = seekable && mode !== 'estimated' ? (time: number) => seekTo(Math.max(0, (time - offset) * (mode === 'scaled' ? ratio : 1))) : undefined

  return <LineList items={items} active={active} onSeek={onSeek} onCalibrate={onCalibrate} header={header} />
}
