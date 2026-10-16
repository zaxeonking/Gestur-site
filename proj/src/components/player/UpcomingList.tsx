import { GripVertical, Play } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { IndexedTrack, PlaylistTrack } from '../../types/spotify'
import { fallbackCover } from '../../utils/fallbackCover'
import CoverArt from '../ui/CoverArt'

const FOCUS = 'focus-ring'
/** Lama menahan sebelum menu muncul, dan jarak geser yang masih dianggap \"diam\". */
const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP_PX = 10
/** Jarak dari tepi area gulir yang memicu gulir otomatis saat menyeret. */
const EDGE_ZONE_PX = 56

function TrackCover({ track }: { track: PlaylistTrack }) {
  const fallback = useMemo(() => fallbackCover(`${track.title}${track.album}`), [track.title, track.album])
  return <CoverArt cover={fallback} src={track.cover} />
}

interface DragState {
  from: number
  to: number
  /** Pergeseran vertikal baris yang diseret (px), sudah termasuk gulir. */
  dy: number
  height: number
}

interface RowProps {
  track: PlaylistTrack
  /** Posisi di dalam queue (bukan di daftar \"Berikutnya\"). */
  index: number
  position: number
  count: number
  style: CSSProperties
  dragging: boolean
  onPlay: (index: number) => void
  onOpenMenu: (position: number) => void
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>, position: number) => void
  onHandlePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onHandlePointerEnd: (event: PointerEvent<HTMLButtonElement>, commit: boolean) => void
  onNudge: (position: number, delta: -1 | 1) => void
}

/**
 * Satu lagu di \"Berikutnya\". Ketuk = putar. Tahan lama (atau klik kanan) = menu opsi.
 * Pegangan di kanan = seret untuk mengubah urutan (atau panah atas/bawah saat pegangan difokus).
 */
const UpcomingRow = memo(function UpcomingRow({
  track,
  index,
  position,
  count,
  style,
  dragging,
  onPlay,
  onOpenMenu,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerEnd,
  onNudge,
}: RowProps) {
  const by = track.artists ? ` oleh ${track.artists}` : ''
  const timerRef = useRef<number | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const firedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])
  useEffect(() => clearTimer, [clearTimer])

  const openMenu = useCallback(() => {
    firedRef.current = true
    navigator.vibrate?.(15)
    onOpenMenu(position)
  }, [onOpenMenu, position])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      onNudge(position, event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  return (
    <li style={style} className={`relative select-none ${dragging ? 'z-10 rounded-md bg-card shadow-xl shadow-black/50' : ''}`}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => {
            if (firedRef.current) {
              firedRef.current = false
              return
            }
            onPlay(index)
          }}
          onPointerDown={(e) => {
            firedRef.current = false
            startRef.current = { x: e.clientX, y: e.clientY }
            clearTimer()
            timerRef.current = window.setTimeout(openMenu, LONG_PRESS_MS)
          }}
          onPointerMove={(e) => {
            if (timerRef.current === null) return
            if (Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > LONG_PRESS_SLOP_PX) clearTimer()
          }}
          onPointerUp={clearTimer}
          onPointerCancel={clearTimer}
          onPointerLeave={clearTimer}
          onContextMenu={(e) => {
            // Klik kanan (desktop) dan tahan lama bawaan WebView: pakai menu kita, bukan menu browser.
            e.preventDefault()
            clearTimer()
            if (!firedRef.current) openMenu()
          }}
          aria-label={`Putar ${track.title}${by}`}
          aria-haspopup="dialog"
          className={`group flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors [-webkit-touch-callout:none] hover:bg-raised active:bg-raised ${FOCUS}`}
        >
          <span className="w-6 shrink-0 text-center text-sm tabular-nums text-ink-muted" aria-hidden="true">
            {index + 1}
          </span>
          <span className="w-11 shrink-0">
            <TrackCover track={track} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{track.title}</span>
            <span className="block truncate text-xs text-ink-muted">{track.artists}</span>
          </span>
          {track.duration && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{track.duration}</span>}
          <Play
            className="h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent"
            fill="currentColor"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          aria-label={`Ubah urutan ${track.title}. Seret, atau tekan panah atas dan bawah.`}
          title="Seret untuk mengubah urutan"
          onPointerDown={(e) => onHandlePointerDown(e, position)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={(e) => onHandlePointerEnd(e, true)}
          onPointerCancel={(e) => onHandlePointerEnd(e, false)}
          onKeyDown={handleKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          disabled={count < 2}
          className={`flex h-11 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-ink-muted hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-30 ${FOCUS}`}
        >
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
})

interface UpcomingListProps {
  items: IndexedTrack[]
  /** Elemen yang menggulir daftar ini; dipakai untuk gulir otomatis saat menyeret. */
  scrollRef: RefObject<HTMLElement>
  onPlay: (index: number) => void
  onOpenMenu: (position: number) => void
  onMove: (from: number, to: number) => void
}

/** Daftar \"Berikutnya\" dengan seret-untuk-mengurutkan dan tahan-lama-untuk-menu. */
export default function UpcomingList({ items, scrollRef, onPlay, onOpenMenu, onMove }: UpcomingListProps) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const metaRef = useRef<{ startY: number; startScroll: number; from: number; height: number; pointerY: number } | null>(null)
  const countRef = useRef(items.length)
  countRef.current = items.length

  /** Hitung ulang pergeseran dan posisi tujuan dari posisi jari + gulir saat ini. */
  const update = useCallback(() => {
    const meta = metaRef.current
    if (!meta) return
    const scrolled = (scrollRef.current?.scrollTop ?? 0) - meta.startScroll
    const dy = meta.pointerY - meta.startY + scrolled
    const to = Math.min(countRef.current - 1, Math.max(0, meta.from + Math.round(dy / meta.height)))
    setDrag((prev) => (prev && prev.dy === dy && prev.to === to ? prev : { from: meta.from, to, dy, height: meta.height }))
  }, [scrollRef])

  // Selama menyeret: gulir otomatis bila jari dekat tepi atas/bawah area gulir.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    let frame = 0
    const tick = () => {
      const el = scrollRef.current
      const meta = metaRef.current
      if (el && meta) {
        const rect = el.getBoundingClientRect()
        const top = meta.pointerY - rect.top
        const bottom = rect.bottom - meta.pointerY
        let step = 0
        if (top < EDGE_ZONE_PX) step = -Math.ceil(((EDGE_ZONE_PX - Math.max(top, 0)) / EDGE_ZONE_PX) * 12)
        else if (bottom < EDGE_ZONE_PX) step = Math.ceil(((EDGE_ZONE_PX - Math.max(bottom, 0)) / EDGE_ZONE_PX) * 12)
        if (step !== 0) {
          el.scrollTop += step
          update()
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [dragging, scrollRef, update])

  const onHandlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, position: number) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const row = event.currentTarget.closest('li')
      if (!row) return
      event.currentTarget.setPointerCapture(event.pointerId)
      metaRef.current = {
        startY: event.clientY,
        startScroll: scrollRef.current?.scrollTop ?? 0,
        from: position,
        height: row.offsetHeight || 60,
        pointerY: event.clientY,
      }
      navigator.vibrate?.(10)
      setDrag({ from: position, to: position, dy: 0, height: metaRef.current.height })
    },
    [scrollRef],
  )

  const onHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!metaRef.current) return
      metaRef.current.pointerY = event.clientY
      update()
    },
    [update],
  )

  const onHandlePointerEnd = useCallback(
    (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
      const meta = metaRef.current
      if (!meta) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      metaRef.current = null
      const scrolled = (scrollRef.current?.scrollTop ?? 0) - meta.startScroll
      const dy = event.clientY - meta.startY + scrolled
      const to = Math.min(countRef.current - 1, Math.max(0, meta.from + Math.round(dy / meta.height)))
      setDrag(null)
      if (commit && to !== meta.from) onMove(meta.from, to)
    },
    [onMove, scrollRef],
  )

  const onNudge = useCallback(
    (position: number, delta: -1 | 1) => onMove(position, position + delta),
    [onMove],
  )

  return (
    <ul data-queue-upcoming="">
      {items.map(({ track, index }, position) => {
        let style: CSSProperties = {}
        if (drag) {
          if (position === drag.from) {
            style = { transform: `translateY(${drag.dy}px)`, transition: 'none' }
          } else {
            const shift =
              drag.from < drag.to && position > drag.from && position <= drag.to
                ? -drag.height
                : drag.from > drag.to && position < drag.from && position >= drag.to
                  ? drag.height
                  : 0
            style = { transform: `translateY(${shift}px)`, transition: 'transform 150ms ease-out' }
          }
        }
        return (
          <UpcomingRow
            key={track.id}
            track={track}
            index={index}
            position={position}
            count={items.length}
            style={style}
            dragging={drag?.from === position}
            onPlay={onPlay}
            onOpenMenu={onOpenMenu}
            onHandlePointerDown={onHandlePointerDown}
            onHandlePointerMove={onHandlePointerMove}
            onHandlePointerEnd={onHandlePointerEnd}
            onNudge={onNudge}
          />
        )
      })}
    </ul>
  )
}
