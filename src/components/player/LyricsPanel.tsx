import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import type { LyricsState } from '../../hooks/useLyrics'
import type { LyricsResult, SyncedVersion } from '../../services/lyricsApi'
import { useLongPress } from '../../hooks/useLongPress'
import { findActiveLine } from '../../utils/lrc'
import { readJson, removeKey, writeJson } from '../../utils/safeStorage'

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

interface Item {
  text: string
  /** Detik pada versi lirik; ada hanya untuk mode berwaktu. */
  time?: number
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
  return <LineList items={items} active={active} header={ESTIMATE_NOTE} />
}

function SyncedLyrics({ result, trackKey }: { result: Extract<LyricsResult, { kind: 'synced' }>; trackKey?: string }) {
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

  // Penyelarasan manual (detik): positif = lirik maju. Disimpan per lagu supaya tidak perlu diulang.
  const storageKey = trackKey ? `musicverse:lyricsOffset:${trackKey.toLowerCase()}` : null
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!storageKey) return setOffset(0)
    const saved = readJson(storageKey)
    setOffset(saved.status === 'ok' && typeof saved.value === 'number' && Number.isFinite(saved.value) ? saved.value : 0)
  }, [storageKey])

  // Mode waktu: 'exact' | 'scaled' | 'estimated'.
  const known = audioDuration !== null && lyricsDuration !== null && Number.isFinite(audioDuration) && audioDuration > 0
  const diff = known ? Math.abs(lyricsDuration - audioDuration) : 0
  const ratio = known ? audioDuration / lyricsDuration : 1
  const mode: 'exact' | 'scaled' | 'estimated' = !known || diff <= TIMING_EXACT_S ? 'exact' : ratio >= SCALE_MIN && ratio <= SCALE_MAX ? 'scaled' : 'estimated'
  // Pada mode 'scaled', waktu audio dikembalikan ke skala versi lirik sebelum dicari barisnya.
  const lyricTime = mode === 'scaled' ? currentTime / ratio : currentTime

  const active = useMemo(
    () => (mode === 'estimated' ? estimateActive(items, currentTime, audioDuration) : findActiveLine(lines, lyricTime + offset + LEAD_S)),
    [mode, items, lines, currentTime, lyricTime, offset, audioDuration],
  )

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
