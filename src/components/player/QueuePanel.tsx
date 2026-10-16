import { AlertCircle, ListMusic, Loader2, Pause, Play, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import type { PlaylistTrack } from '../../types/spotify'
import { fallbackCover } from '../../utils/fallbackCover'
import { getUpcomingTracks } from '../../utils/playerQueue'
import { STATUS_TEXT } from '../../utils/playerStatus'
import CoverArt from '../ui/CoverArt'
import { describeMainButton } from './PlayerControls'
import TrackActionSheet from './TrackActionSheet'
import UpcomingList from './UpcomingList'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FOCUS = 'focus-ring'

function TrackCover({ track }: { track: PlaylistTrack }) {
  const fallback = useMemo(() => fallbackCover(`${track.title}${track.album}`), [track.title, track.album])
  return <CoverArt cover={fallback} src={track.cover} />
}

/**
 * Tampilan Queue: lagu yang sedang diputar + lagu-lagu berikutnya. Hanya membaca `queue` dan
 * `currentIndex` dari state pemutar yang sama dengan MiniPlayer/FullPlayer, jadi ketiganya
 * selalu sinkron. Mobile: bottom sheet. Desktop (lg): panel di sisi kanan.
 */
export default function QueuePanel({ onClose }: { onClose: () => void }) {
  const {
    queue,
    currentIndex,
    currentTrack,
    status,
    error,
    shuffle,
    shuffleOrder,
    togglePlayPause,
    playQueueItem,
    moveUpcoming,
    removeUpcoming,
  } = useAudioPlayer()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Menu opsi memakai id lagu (bukan posisi) supaya tetap benar bila antrean berubah saat menu terbuka.
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  const upcoming = useMemo(
    () => getUpcomingTracks(queue, currentIndex, shuffleOrder),
    [queue, currentIndex, shuffleOrder],
  )

  const menuPosition = menuTrackId === null ? -1 : upcoming.findIndex((item) => item.track.id === menuTrackId)
  const menuItem = menuPosition === -1 ? null : upcoming[menuPosition]

  // Lagu di menu sudah tidak ada di "Berikutnya" (mis. jadi lagu aktif): tutup menunya.
  useEffect(() => {
    if (menuTrackId !== null && menuPosition === -1) setMenuTrackId(null)
  }, [menuTrackId, menuPosition])

  const openMenu = useCallback(
    (position: number) => {
      const item = upcoming[position]
      if (item) setMenuTrackId(item.track.id)
    },
    [upcoming],
  )

  const closeMenu = useCallback(() => {
    setMenuTrackId(null)
    dialogRef.current?.focus()
  }, [])

  // Baris yang diklik pindah ke "Sedang diputar" (ter-unmount), sehingga fokus jatuh ke <body> dan
  // Esc/Tab tidak lagi sampai ke dialog. Fokus dikembalikan ke dialog agar keyboard tetap berfungsi.
  const handlePlayItem = useCallback(
    (index: number) => {
      playQueueItem(index)
      dialogRef.current?.focus()
    },
    [playQueueItem],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!currentTrack || currentIndex === null) return null

  const main = describeMainButton(status)
  const isError = status === 'error'
  const NowIcon = main.kind === 'pause' ? Pause : main.kind === 'busy' ? Loader2 : main.kind === 'retry' ? RotateCw : Play
  const by = currentTrack.artists ? ` oleh ${currentTrack.artists}` : ''

  return (
    <div className="fixed inset-0 z-[60]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Antrean"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] animate-sheet-up flex-col rounded-t-2xl border-t border-line bg-card pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl shadow-black/60 focus:outline-none lg:inset-y-0 lg:animate-panel-in lg:left-auto lg:right-0 lg:max-h-none lg:w-[26rem] lg:rounded-none lg:border-l lg:border-t-0"
      >
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <ListMusic className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <h2 className="truncate font-display text-lg font-bold text-ink">Antrean</h2>
            <span className="shrink-0 text-xs text-ink-muted">
              {currentIndex + 1} / {queue.length}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup antrean"
            className="icon-btn -mr-2 hover:bg-white/10"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <section aria-label="Sedang diputar">
            <h3 className="px-2 pb-1 pt-2 text-sm font-semibold text-ink-muted">
              Sedang diputar
            </h3>
            <button
              type="button"
              onClick={togglePlayPause}
              aria-disabled={main.disabled}
              aria-label={`${main.label}: ${currentTrack.title}${by}`}
              aria-current="true"
              data-queue-current=""
              className={`flex w-full items-center gap-3 rounded-md bg-raised px-2 py-2 text-left shadow-now aria-disabled:cursor-default ${FOCUS}`}
            >
              <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-accent" aria-hidden="true">
                {currentIndex + 1}
              </span>
              <span className="w-11 shrink-0">
                <TrackCover track={currentTrack} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-accent">{currentTrack.title}</span>
                <span className={`block truncate text-xs ${isError ? 'text-danger' : 'text-ink-muted'}`}>
                  {isError ? STATUS_TEXT.error : status === 'playing' ? currentTrack.artists : STATUS_TEXT[status] || currentTrack.artists}
                </span>
              </span>
              <NowIcon
                className={`h-5 w-5 shrink-0 text-accent ${main.kind === 'busy' ? 'animate-spin motion-reduce:animate-none' : ''}`}
                fill={main.kind === 'busy' || main.kind === 'retry' ? 'none' : 'currentColor'}
                aria-hidden="true"
              />
            </button>
            {isError && error && (
              <p role="alert" className="mt-2 flex items-start gap-2 px-2 text-xs text-ink">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <span>
                  {error.message} <span className="text-ink-muted">Pilih lagu lain di bawah untuk melanjutkan.</span>
                </span>
              </p>
            )}
          </section>

          <section aria-label="Berikutnya">
            <h3 className="px-2 pb-1 pt-4 text-sm font-semibold text-ink-muted">
              Berikutnya{upcoming.length > 0 ? ` · ${upcoming.length}` : ''}{shuffle ? ' · acak' : ''}
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-2 py-4 text-sm text-ink-muted">
                Tidak ada lagu berikutnya. Ini lagu terakhir di antrean.
              </p>
            ) : (
              <UpcomingList
                items={upcoming}
                scrollRef={scrollRef}
                onPlay={handlePlayItem}
                onOpenMenu={openMenu}
                onMove={moveUpcoming}
              />
            )}
          </section>
        </div>
      </div>

      {menuItem && (
        <TrackActionSheet
          track={menuItem.track}
          position={menuPosition}
          count={upcoming.length}
          onPlayNow={() => {
            setMenuTrackId(null)
            handlePlayItem(menuItem.index)
          }}
          onPlayNext={() => {
            moveUpcoming(menuPosition, 0)
            closeMenu()
          }}
          onMoveToEnd={() => {
            moveUpcoming(menuPosition, upcoming.length - 1)
            closeMenu()
          }}
          onRemove={() => {
            removeUpcoming(menuPosition)
            closeMenu()
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
