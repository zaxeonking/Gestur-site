import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { useNowPlaying } from '../../hooks/useNowPlaying'
import { STATUS_TEXT } from '../../utils/playerStatus'
import CoverArt from '../ui/CoverArt'
import { PlayerError, QueueButton, SpotifyLink, TransportControls } from './PlayerControls'
import LyricLine from './LyricLine'
import SeekBar from './SeekBar'

/**
 * Mini player. Anak flex AppShell tepat di atas BottomNav (bukan position: fixed), jadi konten
 * di atasnya otomatis berhenti di sini dan tidak pernah tertutup. Hanya membaca dari audio engine
 * lewat useAudioPlayer; tidak punya state playback sendiri.
 */
export default function MiniPlayer({ onOpen, onOpenQueue }: { onOpen: () => void; onOpenQueue: () => void }) {
  const { status } = useAudioPlayer()
  const now = useNowPlaying()

  if (!now) return null
  const isError = status === 'error'
  const statusText = STATUS_TEXT[status]
  // Saat bukan playing/paused, tampilkan status nyata menggantikan nama artis.
  const subtitle = status === 'resolving' || status === 'loading' || status === 'buffering' ? statusText : now.artists

  return (
    <div className="pointer-events-none relative z-40 h-0 shrink-0">
    <div className="absolute inset-x-0 bottom-0 mb-4 ml-[max(0.75rem,env(safe-area-inset-left))] mr-[max(0.75rem,env(safe-area-inset-right))] flex animate-player-up flex-col gap-2 lg:mx-6 lg:mb-6">
    <div className="pointer-events-auto">
      <LyricLine />
    </div>
    <div
      role="region"
      aria-label="Pemutar musik"
      className="pointer-events-auto overflow-hidden rounded-3xl border border-white/10 bg-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 [-webkit-backdrop-filter:blur(24px)_saturate(150%)]"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-4 pb-2.5 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-6 lg:px-6 lg:py-2">
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
          {/* Layar sempit: tautan Spotify ada di full player; ruang mini player dipakai untuk judul + kontrol. */}
          <SpotifyLink url={now.spotifyUrl} variant="icon" className="hidden sm:flex lg:hidden" />
        </div>

        <div className="col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-2">
          {isError ? <PlayerError compact className="py-0.5" /> : <SeekBar size="sm" />}
        </div>

        <div className="hidden items-center justify-end gap-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex">
          <QueueButton onClick={onOpenQueue} className="flex" />
          <SpotifyLink url={now.spotifyUrl} variant="icon" />
        </div>
      </div>
      {/* Pembaca layar: status playback diumumkan tanpa menunggu fokus. */}
      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>
    </div>
    </div>
    </div>
  )
}
