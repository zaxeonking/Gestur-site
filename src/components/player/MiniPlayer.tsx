import { useEffect, useRef } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { useNowPlaying } from '../../hooks/useNowPlaying'
import { STATUS_TEXT } from '../../utils/playerStatus'
import CoverArt from '../ui/CoverArt'
import CollectionButton from './CollectionButton'
import { PlayerError, QueueButton, SpotifyLink, TransportControls } from './PlayerControls'
import SeekBar from './SeekBar'

/** Tinggi MiniPlayer diekspos sebagai CSS variable agar konten halaman tidak tertutup. */
const HEIGHT_VAR = '--mini-player-h'

/**
 * Mini player. Mobile: menempel tepat di atas BottomNav (tinggi 4rem + border 1px + safe area).
 * Desktop: di bawah layout, di sebelah kanan sidebar. Hanya membaca dari audio engine
 * lewat useAudioPlayer; tidak punya state playback sendiri.
 */
export default function MiniPlayer({ onOpen, onOpenQueue }: { onOpen: () => void; onOpenQueue: () => void }) {
  const { status } = useAudioPlayer()
  const now = useNowPlaying()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const root = document.documentElement
    const update = () => root.style.setProperty(HEIGHT_VAR, `${el.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(HEIGHT_VAR)
    }
  }, [])

  if (!now) return null
  const isError = status === 'error'
  const statusText = STATUS_TEXT[status]
  // Saat bukan playing/paused, tampilkan status nyata menggantikan nama artis.
  const subtitle = status === 'resolving' || status === 'loading' || status === 'buffering' ? statusText : now.artists

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Pemutar musik"
      className="fixed inset-x-0 bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-40 animate-player-up border-t border-line bg-card/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur lg:bottom-0 lg:left-sidebar"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-3 pb-1.5 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-6 lg:px-6 lg:py-2">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label={`Buka pemutar penuh: ${now.title}${now.artists ? `, ${now.artists}` : ''}`}
          className="flex min-w-0 items-center gap-3 rounded-md text-left transition-opacity active:opacity-80 focus-ring lg:row-span-2"
        >
          <div className="w-11 shrink-0 lg:w-14">
            <CoverArt cover={now.cover} src={now.coverSrc} />
          </div>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{now.title}</span>
            <span className={`block truncate text-xs ${status === 'error' ? 'text-danger' : 'text-ink-muted'}`}>
              {isError ? STATUS_TEXT.error : subtitle}
            </span>
          </span>
        </button>

        <div className="flex items-center justify-end lg:col-start-2 lg:justify-center">
          <TransportControls />
          {/* Layar sempit: antrean dibuka dari full player (ruang mini player terbatas). */}
          <QueueButton onClick={onOpenQueue} className="hidden sm:flex lg:hidden" />
          <CollectionButton className="hidden sm:flex lg:hidden" />
          {/* Layar sempit: tautan Spotify ada di full player; ruang mini player dipakai untuk judul + kontrol. */}
          <SpotifyLink url={now.spotifyUrl} variant="icon" className="hidden sm:flex lg:hidden" />
        </div>

        <div className="col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-2">
          {isError ? <PlayerError compact className="py-0.5" /> : <SeekBar size="sm" />}
        </div>

        <div className="hidden items-center justify-end gap-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex">
          <CollectionButton className="flex" />
          <QueueButton onClick={onOpenQueue} className="flex" />
          <SpotifyLink url={now.spotifyUrl} variant="icon" />
        </div>
      </div>
      {/* Pembaca layar: status playback diumumkan tanpa menunggu fokus. */}
      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>
    </div>
  )
}
