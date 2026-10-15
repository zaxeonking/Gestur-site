import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { useNowPlaying } from '../../hooks/useNowPlaying'
import { looksLikeSameTrack, STATUS_TEXT } from '../../utils/playerStatus'
import CoverArt from '../ui/CoverArt'
import { PlayerError, QueueButton, SpotifyLink, TransportControls } from './PlayerControls'
import SeekBar from './SeekBar'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Pemutar penuh (dialog modal). Memakai state dan aksi yang sama dengan MiniPlayer,
 * sehingga keduanya selalu sinkron. Esc / tombol turun menutupnya.
 */
export default function FullPlayer({ onClose, onOpenQueue }: { onClose: () => void; onOpenQueue: () => void }) {
  const { status, currentTrack, playbackInfo } = useAudioPlayer()
  const now = useNowPlaying()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Fokus masuk ke dialog, scroll halaman dikunci, fokus dikembalikan saat ditutup.
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

  if (!now || !currentTrack) return null
  const isError = status === 'error'
  const mismatch = playbackInfo !== null && !looksLikeSameTrack(currentTrack, playbackInfo)

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Pemutar penuh"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex animate-sheet-up flex-col overflow-y-auto bg-bg"
      style={{ backgroundImage: `linear-gradient(180deg, ${now.cover.from}66 0%, #121212 70%)` }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup pemutar penuh"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-white/10 focus-ring"
          >
            <ChevronDown className="h-7 w-7" aria-hidden="true" />
          </button>
          <p className="truncate px-2 text-sm font-medium text-ink-muted">Sedang diputar</p>
          <QueueButton onClick={onOpenQueue} size="lg" className="-mr-2 flex" />
        </header>

        <div className="flex flex-1 items-center justify-center py-4">
          <div className="w-[min(100%,38dvh,26rem)] shadow-2xl shadow-black/50">
            <CoverArt cover={now.cover} src={now.coverSrc} />
          </div>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <div className="min-w-0">
            <h2 title={now.title} className="line-clamp-2 break-words font-display text-2xl font-bold leading-tight text-ink">
              {now.title}
            </h2>
            <p className="mt-1 truncate text-base text-ink-muted">{now.artists}</p>
            {now.album && <p className="mt-0.5 truncate text-sm text-ink-faint">{now.album}</p>}
          </div>

          {isError ? (
            <PlayerError />
          ) : (
            <>
              <SeekBar />
              <p role="status" className="min-h-4 text-center text-xs text-ink-muted" aria-live="polite">
                {status === 'playing' ? '' : STATUS_TEXT[status]}
              </p>
            </>
          )}

          <TransportControls size="lg" />

          <div className="flex justify-center">
            <SpotifyLink url={now.spotifyUrl} variant="button" />
          </div>

          {mismatch && playbackInfo && (
            <p className="text-center text-xs text-ink-muted">
              Audio yang ditemukan server berbeda dari lagu yang dipilih: {playbackInfo.title}
              {playbackInfo.artist ? ` — ${playbackInfo.artist}` : ''}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
