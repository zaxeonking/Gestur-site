import {
  AlertCircle,
  ExternalLink,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import type { PlaybackStatus, RepeatMode } from '../../types/player'

type ButtonKind = 'play' | 'pause' | 'busy' | 'retry'

/**
 * Tombol utama mengikuti status audio SEBENARNYA: ikon Pause hanya muncul setelah event
 * `playing`. Saat menunggu (resolving/loading/buffering) yang tampil spinner, bukan "playing".
 */
export function describeMainButton(status: PlaybackStatus): { kind: ButtonKind; label: string; disabled: boolean } {
  switch (status) {
    case 'playing':
      return { kind: 'pause', label: 'Jeda', disabled: false }
    case 'paused':
      return { kind: 'play', label: 'Lanjutkan', disabled: false }
    case 'resolving':
      return { kind: 'busy', label: 'Mencari audio', disabled: true }
    case 'loading':
      return { kind: 'busy', label: 'Memuat audio, tekan untuk menjeda', disabled: false }
    case 'buffering':
      return { kind: 'busy', label: 'Buffering, tekan untuk menjeda', disabled: false }
    case 'ended':
      return { kind: 'retry', label: 'Putar ulang', disabled: false }
    case 'error':
      return { kind: 'retry', label: 'Coba lagi', disabled: false }
    default:
      return { kind: 'play', label: 'Putar', disabled: true }
  }
}

const FOCUS = 'focus-ring'

interface TransportControlsProps {
  /** `lg` dipakai di FullPlayer. */
  size?: 'md' | 'lg'
  className?: string
}

/** Teks tombol ulang, dipakai aria-label dan tooltip. Menjelaskan mode sekarang dan hasil ketukan berikutnya. */
export function describeRepeat(repeat: RepeatMode, repeatingOnce = false): { label: string; badge: string | null } {
  switch (repeat) {
    case 'once':
      return {
        label: `Ulang 1x aktif${repeatingOnce ? ' (sedang mengulang)' : ''}. Ketuk untuk ulang terus-menerus`,
        badge: '1',
      }
    case 'one':
      return { label: 'Ulang terus-menerus aktif. Ketuk untuk mematikan', badge: '∞' }
    default:
      return { label: 'Ulang nonaktif. Ketuk untuk ulang 1x', badge: null }
  }
}

/** Tombol acak: aktif / nonaktif. */
export function ShuffleButton({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const { shuffle, toggleShuffle } = useAudioPlayer()
  const big = size === 'lg'
  return (
    <button
      type="button"
      onClick={toggleShuffle}
      aria-pressed={shuffle}
      aria-label={shuffle ? 'Acak aktif, ketuk untuk menonaktifkan' : 'Acak nonaktif, ketuk untuk mengaktifkan'}
      title={shuffle ? 'Acak: aktif' : 'Acak: nonaktif'}
      className={`relative items-center justify-center rounded-full transition-colors active:bg-white/10 ${
        big ? 'h-12 w-12' : 'h-11 w-11 lg:h-9 lg:w-9'
      } ${shuffle ? 'text-accent' : 'text-ink-muted hover:text-ink'} ${FOCUS} ${className}`}
    >
      <Shuffle className={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
      {shuffle && <span aria-hidden="true" className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent" />}
    </button>
  )
}

/** Tombol mode ulang: nonaktif → ulang 1x → ulang terus-menerus. */
export function RepeatButton({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const { repeat, repeatingOnce, cycleRepeat } = useAudioPlayer()
  const big = size === 'lg'
  const { label, badge } = describeRepeat(repeat, repeatingOnce)
  const active = repeat !== 'off'
  return (
    <button
      type="button"
      onClick={cycleRepeat}
      aria-label={label}
      title={label}
      data-repeat-mode={repeat}
      className={`relative items-center justify-center rounded-full transition-colors active:bg-white/10 ${
        big ? 'h-12 w-12' : 'h-11 w-11 lg:h-9 lg:w-9'
      } ${active ? 'text-accent' : 'text-ink-muted hover:text-ink'} ${FOCUS} ${className}`}
    >
      <Repeat className={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
      {badge && (
        <span
          aria-hidden="true"
          className={`absolute flex items-center justify-center rounded-full bg-accent font-bold leading-none text-black ${
            big ? 'right-2 top-2 h-4 min-w-4 px-1 text-[10px]' : 'right-1.5 top-1.5 h-3.5 min-w-3.5 px-0.5 text-[9px] lg:right-0.5 lg:top-0.5'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/** Previous · Play/Pause · Next, semuanya memanggil aksi dari audio engine yang sama. */
export function TransportControls({ size = 'md', className = '' }: TransportControlsProps) {
  const { status, hasPrevious, hasNext, togglePlayPause, playNext, playPrevious } = useAudioPlayer()
  const { seekable } = usePlaybackTime()
  const main = describeMainButton(status)
  const big = size === 'lg'
  // Mobile: target sentuh ≥44px. Desktop (pointer presisi) boleh lebih ringkas.
  const side = big ? 'h-12 w-12' : 'h-11 w-11 lg:h-9 lg:w-9'
  const middle = big ? 'h-16 w-16' : 'h-12 w-12 lg:h-10 lg:w-10'
  const icon = big ? 'h-7 w-7' : 'h-5 w-5'
  const sideIcon = big ? 'h-7 w-7' : 'h-5 w-5'
  const MainIcon = main.kind === 'pause' ? Pause : main.kind === 'busy' ? Loader2 : main.kind === 'retry' ? RotateCw : Play

  // Previous tetap berguna di lagu pertama bila bisa mengulang dari 0:00.
  const canPrevious = hasPrevious || (seekable && (status === 'playing' || status === 'paused' || status === 'buffering'))

  return (
    <div className={`flex items-center justify-center ${big ? 'gap-2 sm:gap-4' : 'gap-1'} ${className}`}>
      {/* Mini player sempit: acak & ulang ada di full player; di layar lebar ikut tampil di sini. */}
      <ShuffleButton size={size} className={big ? 'flex' : 'hidden sm:flex'} />
      <button
        type="button"
        onClick={playPrevious}
        disabled={!canPrevious}
        aria-label="Lagu sebelumnya"
        className={`flex ${side} items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted ${FOCUS}`}
      >
        <SkipBack className={sideIcon} fill="currentColor" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={togglePlayPause}
        disabled={main.disabled}
        aria-label={main.label}
        aria-busy={main.kind === 'busy'}
        data-player-status={status}
        className={`flex ${middle} items-center justify-center rounded-full bg-ink text-black transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:active:scale-100 motion-reduce:transition-none ${FOCUS}`}
      >
        <MainIcon
          className={`${icon} ${main.kind === 'busy' ? 'animate-spin motion-reduce:animate-none' : ''}`}
          fill={main.kind === 'busy' || main.kind === 'retry' ? 'none' : 'currentColor'}
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={playNext}
        disabled={!hasNext}
        aria-label="Lagu berikutnya"
        className={`flex ${side} items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted ${FOCUS}`}
      >
        <SkipForward className={sideIcon} fill="currentColor" aria-hidden="true" />
      </button>
      <RepeatButton size={size} className={big ? 'flex' : 'hidden sm:flex'} />
    </div>
  )
}

interface SpotifyLinkProps {
  url: string | undefined
  /** `icon`: tombol bulat tanpa teks (mini player). `button`: dengan teks (full player). */
  variant: 'icon' | 'button'
  className?: string
}

/** Tautan ke lagu di Spotify; tidak dirender sama sekali jika URL tidak tersedia. */
export function SpotifyLink({ url, variant, className = '' }: SpotifyLinkProps) {
  if (!url) return null
  const common = `items-center justify-center text-ink-muted transition-colors hover:text-accent ${FOCUS}`
  return variant === 'icon' ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buka di Spotify"
      title="Buka di Spotify"
      className={`flex h-11 w-11 rounded-full active:bg-white/10 lg:h-9 lg:w-9 ${common} ${className}`}
    >
      <ExternalLink className="h-5 w-5" aria-hidden="true" />
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-11 gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-ink hover:border-accent active:bg-white/10 ${common} ${className}`}
    >
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      Buka di Spotify
    </a>
  )
}

interface QueueButtonProps {
  onClick: () => void
  size?: 'sm' | 'lg'
  /** Pemanggil menentukan `display` (flex / hidden sm:flex, dst.) agar bisa responsif. */
  className?: string
}

/** Tombol pembuka tampilan Queue (mini player dan full player). */
export function QueueButton({ onClick, size = 'sm', className = '' }: QueueButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buka antrean"
      title="Antrean"
      className={`${
        size === 'lg' ? 'h-11 w-11 hover:bg-white/10 hover:text-ink active:bg-white/15' : 'h-11 w-11 hover:text-accent active:bg-white/10 lg:h-9 lg:w-9'
      } items-center justify-center rounded-full text-ink-muted transition-colors ${FOCUS} ${className}`}
    >
      <ListMusic className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
    </button>
  )
}

interface PlayerErrorProps {
  compact?: boolean
  className?: string
}

/** Pesan error + tombol Retry. Retry meminta URL audio baru, bukan memakai ulang yang lama. */
export function PlayerError({ compact = false, className = '' }: PlayerErrorProps) {
  const { error, retry } = useAudioPlayer()
  const message = error?.message ?? 'Gagal diputar.'
  return (
    <div role="alert" className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} ${className}`}>
      <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
      <p className={`min-w-0 flex-1 text-ink ${compact ? 'line-clamp-2' : ''}`} title={message}>
        {message}
      </p>
      <button
        type="button"
        onClick={retry}
        className={`btn-primary gap-1.5 ${compact ? 'h-10 px-4 text-xs' : ''}`}
      >
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Coba lagi
      </button>
    </div>
  )
}
