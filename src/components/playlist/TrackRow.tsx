import { Loader2, Pause, Play } from 'lucide-react'
import { memo, useMemo } from 'react'
import { usePlayerUiActions } from '../../context/PlayerUiContext'
import { useTrackMenu } from '../../context/TrackMenuContext'
import { useLongPress } from '../../hooks/useLongPress'
import type { RowActivity } from '../../types/player'
import type { PlaylistTrack, PlayTrackHandler } from '../../types/spotify'
import { fallbackCover } from '../../utils/fallbackCover'
import CoverArt from '../ui/CoverArt'

/**
 * Kolom dipakai bersama baris dan kepala kolom agar sejajar.
 * Mobile : nomor · cover · judul/artis(+durasi) · play
 * ≥ sm   : + kolom durasi sendiri
 * ≥ md   : + kolom album (desktop)
 */
export const TRACK_GRID =
  'grid-cols-[1.5rem_3rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 ' +
  'sm:grid-cols-[1.5rem_3rem_minmax(0,1fr)_3rem_2.75rem] ' +
  'md:grid-cols-[2rem_3rem_minmax(0,5fr)_minmax(0,4fr)_3rem_2.75rem] md:gap-x-4'

interface TrackRowProps {
  track: PlaylistTrack
  /** Posisi asli lagu di playlist (0-based), bukan posisi setelah filter. */
  index: number
  selected: boolean
  /** Status playback jika ini lagu aktif di pemutar; 'none' untuk lagu lain. */
  activity?: RowActivity
  onSelect: (id: string) => void
  onPlay: PlayTrackHandler
  /** Baris ini lagu satuan di halaman Cari: menu lagunya boleh memasukkan lagu ke antrean mana pun (bukan dari playlist). */
  fromSearch?: boolean
}

function TrackRow({ track, index, selected, activity = 'none', onSelect, onPlay, fromSearch = false }: TrackRowProps) {
  const fallback = useMemo(() => fallbackCover(`${track.title}${track.album}`), [track.title, track.album])
  const { openTrackMenu } = useTrackMenu()
  const { openFullPlayer } = usePlayerUiActions()
  const longPress = useLongPress(() => openTrackMenu(track, { fromSearch }))
  const number = index + 1
  const isCurrent = activity !== 'none'
  const highlighted = selected || isCurrent
  const Icon = activity === 'playing' ? Pause : activity === 'loading' ? Loader2 : Play
  const by = track.artists ? ` oleh ${track.artists}` : ''
  const playLabel =
    activity === 'playing'
      ? `Jeda ${track.title}${by}`
      : activity === 'loading'
        ? `Memuat ${track.title}${by}`
        : activity === 'paused'
          ? `Lanjutkan ${track.title}${by}`
          : activity === 'error'
            ? `Coba putar lagi ${track.title}${by}`
            : `Putar ${track.title}${by}`

  return (
    <li
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        onSelect(track.id)
        // Ketuk biasa: putar lagu (kecuali sudah aktif) lalu buka pemutar penuh.
        if (activity === 'none' || activity === 'error' || activity === 'ended') onPlay(track, index)
        openFullPlayer()
      }}
      {...longPress}
      className={`grid ${TRACK_GRID} select-none cursor-pointer rounded-md px-2 py-2 transition-colors [-webkit-touch-callout:none] ${
        selected ? 'bg-raised shadow-now' : 'hover:bg-card focus-within:bg-card active:bg-raised'
      }`}
    >
      <span
        className={`text-center text-sm tabular-nums ${highlighted ? 'font-semibold text-accent' : 'text-ink-muted'}`}
      >
        <span className="sr-only">Nomor </span>
        {number}
      </span>

      <CoverArt cover={fallback} src={track.cover} />

      <button
        type="button"
        aria-label={`Buka pemutar: ${track.title}${by}`}
        aria-haspopup="dialog"
        className="min-w-0 rounded-sm text-left focus-ring"
      >
        <p title={track.title} className={`truncate text-base font-medium ${highlighted ? 'text-accent' : 'text-ink'}`}>
          {track.title}
        </p>
        <p className="truncate text-sm text-ink-muted">
          {track.artists}
          {track.duration && <span className="sm:hidden"> · {track.duration}</span>}
          {activity === 'error' && <span className="text-danger"> · Gagal diputar</span>}
        </p>
      </button>

      <p className="hidden truncate text-sm text-ink-muted md:block">{track.album}</p>
      <p className="hidden text-right text-sm tabular-nums text-ink-muted sm:block">{track.duration}</p>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onPlay(track, index)
        }}
        aria-label={playLabel}
        aria-busy={activity === 'loading'}
        className={`flex h-11 w-11 items-center justify-center justify-self-end rounded-full transition-colors hover:bg-white/10 active:bg-white/15 focus-ring ${
          highlighted ? 'text-accent' : 'text-ink-muted hover:text-accent'
        }`}
      >
        <Icon
          className={`h-5 w-5 ${activity === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`}
          fill={activity === 'loading' ? 'none' : 'currentColor'}
          aria-hidden="true"
        />
      </button>
    </li>
  )
}

export default memo(TrackRow)
