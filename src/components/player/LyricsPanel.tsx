import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import type { LyricsState } from '../../hooks/useLyrics'
import type { LyricsResult, SyncedVersion } from '../../services/lyricsApi'
import { findActiveLine } from '../../utils/lrc'

interface LyricsPanelProps {
  state: LyricsState
  onRetry: () => void
}

function Message({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-ink-muted">{children}</div>
}

/** Pudar di tepi atas/bawah kotak supaya baris seolah muncul dan hilang saat bergulir naik. */
const FADE_MASK = {
  maskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
} as const

/** Layar memutakhirkan waktu ±4x/detik; baris disorot sedikit lebih awal agar terasa pas dengan suara. */
const LEAD_S = 0.3
/** Selisih durasi (detik) lirik vs audio: sampai batas ini waktu lirik dipakai apa adanya. */
const TIMING_EXACT_S = 15
/** Di luar batas di atas, waktu lirik diregangkan sesuai rasio durasi hanya jika rasionya masuk akal (versi cepat/lambat/terpotong). */
const SCALE_MIN = 0.8
const SCALE_MAX = 1.25

/**
 * Lirik di pemutar penuh. SELALU bergerak mengikuti lagu:
 *  - bertanda waktu + durasi cocok  → sorotan memakai waktu aslinya,
 *  - bertanda waktu + durasi agak beda → waktu diregangkan sesuai rasio durasi,
 *  - tanpa waktu / waktu tak bisa dipercaya → sorotan PERKIRAAN menurut progres lagu.
 * Ketuk baris (jika audio bisa di-seek) untuk loncat ke bagian itu, hanya pada mode berwaktu.
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
  if (result.kind === 'plain') return <PlainLyrics lines={result.lines} />
  return <SyncedLyrics result={result} />
}

interface Item {
  text: string
  /** Detik pada versi lirik; ada hanya untuk mode berwaktu. */
  time?: number
}

/** Daftar baris yang menggulir baris aktif ke tengah (selalu, setiap baris aktif berganti). */
function LineList({ items, active, onSeek, note }: { items: Item[]; active: number; onSeek?: (time: number) => void; note?: string }) {
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
      {note && (
        <p role="status" className="shrink-0 px-4 pt-2 text-center text-[11px] text-ink-faint">
          {note}
        </p>
      )}
      <div
        ref={containerRef}
        style={FADE_MASK}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-[18dvh] text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const isActive = i === active
          const className = `block w-full origin-center rounded-md px-1 py-1.5 text-xl font-bold leading-snug transition-all duration-300 ${
            isActive ? 'scale-105 text-ink' : i < active ? 'text-white/30' : 'text-white/50'
          }`
          const text = item.text || '♪'
          return onSeek && item.time !== undefined ? (
            <button
              key={i}
              type="button"
              data-line={i}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onSeek(item.time as number)}
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
        <p className="pt-6 text-[11px] text-ink-faint">Lirik dari LRCLIB / NetEase</p>
      </div>
    </div>
  )
}

/**
 * Baris aktif menurut PROGRES lagu (tanpa waktu per baris): baris berisi dibagi rata sepanjang lagu,
 * dengan sedikit jeda di awal (intro) dan akhir (outro). Hanya perkiraan, tetapi tetap bergerak.
 */
function estimateActive(items: Item[], currentTime: number, duration: number | null): number {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return -1
  const filled = items.map((item, i) => (item.text.trim() ? i : -1)).filter((i) => i >= 0)
  if (filled.length === 0) return -1
  const progress = Math.min(1, Math.max(0, (currentTime / duration - 0.06) / 0.86))
  return filled[Math.min(filled.length - 1, Math.floor(progress * filled.length))]
}

const ESTIMATE_NOTE = 'Waktu lirik tidak tersedia, sorotan hanya perkiraan.'

function PlainLyrics({ lines }: { lines: string[] }) {
  const { currentTime, duration } = usePlaybackTime()
  const items = useMemo<Item[]>(() => lines.map((text) => ({ text })), [lines])
  const active = estimateActive(items, currentTime, duration)
  return <LineList items={items} active={active} note={ESTIMATE_NOTE} />
}

function SyncedLyrics({ result }: { result: Extract<LyricsResult, { kind: 'synced' }> }) {
  // `result` stabil selama lagu sama, jadi `primary` tidak berubah identitas di setiap render.
  const primary = useMemo<SyncedVersion>(() => ({ lines: result.lines, duration: result.duration }), [result])
  const alternatives = result.alternatives
  const { currentTime, seekable, duration: audioDuration } = usePlaybackTime()
  const { seekTo } = useAudioPlayer()

  // Pilih versi yang durasinya paling dekat dengan audio SATU KALI saja (saat durasi audio pertama diketahui),
  // lalu kunci. Berganti versi di tengah lagu membuat lirik loncat-loncat.
  const [picked, setPicked] = useState<SyncedVersion | null>(null)
  useEffect(() => setPicked(null), [primary])
  useEffect(() => {
    if (picked !== null || alternatives.length === 0) return
    if (audioDuration === null || !Number.isFinite(audioDuration) || audioDuration <= 0) return
    const gap = (v: SyncedVersion) => (v.duration === null ? Infinity : Math.abs(v.duration - audioDuration))
    const best = alternatives.reduce((a, b) => (gap(b) < gap(a) ? b : a))
    // Ganti hanya jika jelas lebih pas (>= 2 dtk lebih dekat dari versi utama).
    setPicked(gap(best) <= gap(primary) - 2 ? best : primary)
  }, [picked, primary, alternatives, audioDuration])
  const { lines, duration: lyricsDuration } = picked ?? primary

  const items = useMemo<Item[]>(() => lines.map((line) => ({ text: line.text, time: line.time })), [lines])

  // Mode waktu: 'exact' | 'scaled' | 'estimated'.
  const known = audioDuration !== null && lyricsDuration !== null && Number.isFinite(audioDuration) && audioDuration > 0
  const diff = known ? Math.abs(lyricsDuration - audioDuration) : 0
  const ratio = known ? audioDuration / lyricsDuration : 1
  const mode: 'exact' | 'scaled' | 'estimated' = !known || diff <= TIMING_EXACT_S ? 'exact' : ratio >= SCALE_MIN && ratio <= SCALE_MAX ? 'scaled' : 'estimated'
  // Pada mode 'scaled', waktu audio dikembalikan ke skala versi lirik sebelum dicari barisnya.
  const lyricTime = mode === 'scaled' ? currentTime / ratio : currentTime

  const active = useMemo(
    () => (mode === 'estimated' ? estimateActive(items, currentTime, audioDuration) : findActiveLine(lines, lyricTime + LEAD_S)),
    [mode, items, lines, currentTime, lyricTime, audioDuration],
  )

  const note =
    mode === 'estimated'
      ? `Durasi audio (${Math.round(audioDuration ?? 0)} dtk) jauh beda dari versi lirik (${Math.round(lyricsDuration ?? 0)} dtk), sorotan hanya perkiraan.`
      : mode === 'scaled'
        ? 'Durasi audio agak beda dari versi lirik, waktu disesuaikan.'
        : undefined

  // Loncat ke baris hanya akurat pada mode 'exact'; pada 'scaled' waktu dikonversi balik.
  const onSeek = seekable && mode !== 'estimated' ? (time: number) => seekTo(mode === 'scaled' ? time * ratio : time) : undefined

  return <LineList items={items} active={active} onSeek={onSeek} note={note} />
}
