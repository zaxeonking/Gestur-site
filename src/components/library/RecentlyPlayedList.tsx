import { Loader2, Pause, Play } from 'lucide-react'
import { memo, useMemo } from 'react'
import type { RecentPlay } from '../../types/library'
import type { RowActivity } from '../../types/player'
import { fallbackCover } from '../../utils/fallbackCover'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { recentKey } from '../../utils/libraryStorage'
import { extractTrackId } from '../../utils/spotifyUrl'
import CoverArt from '../ui/CoverArt'

/** Kolom bersama baris; pola yang sama dengan daftar lagu di playlist. */
const RECENT_GRID =
  'grid-cols-[3rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 ' +
  'sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_2.75rem] ' +
  'md:grid-cols-[3rem_minmax(0,5fr)_minmax(0,4fr)_5.5rem_2.75rem] md:gap-x-4'

interface RecentRowProps {
  entry: RecentPlay
  /** Status playback jika ini lagu aktif di pemutar; 'none' untuk lagu lain. */
  activity: RowActivity
  onPlay: (entry: RecentPlay) => void
}

const RecentRow = memo(function RecentRow({ entry, activity, onPlay }: RecentRowProps) {
  const { track } = entry
  const fallback = useMemo(() => fallbackCover(`${track.title}${track.album}`), [track.title, track.album])
  const time = formatRelativeTime(entry.playedAt)
  const href = extractTrackId(track.url) ? track.url : undefined
  const highlighted = activity !== 'none'
  const Icon = activity === 'playing' ? Pause : activity === 'loading' ? Loader2 : Play
  const by = track.artists ? ` oleh ${track.artists}` : ''
  const label =
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
    <li className={`grid ${RECENT_GRID} rounded-md px-2 py-2 transition-colors hover:bg-card focus-within:bg-card active:bg-raised`}>
      <CoverArt cover={fallback} src={track.cover} />

      <div className="min-w-0">
        <p title={track.title} className={`truncate text-base font-medium ${highlighted ? 'text-accent' : 'text-ink'}`}>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm hover:underline focus-ring"
            >
              {track.title}
              <span className="sr-only"> (buka di Spotify)</span>
            </a>
          ) : (
            track.title
          )}
        </p>
        <p className="truncate text-sm text-ink-muted">
          {track.artists}
          {time && <span className="sm:hidden"> · {time}</span>}
          {activity === 'error' && <span className="text-danger"> · Gagal diputar</span>}
        </p>
      </div>

      <p className="hidden truncate text-sm text-ink-muted md:block">
        {entry.playlistTitle ? `Dari ${entry.playlistTitle}` : ''}
      </p>
      <p className="hidden text-right text-sm text-ink-muted sm:block">{time}</p>

      <button
        type="button"
        onClick={() => onPlay(entry)}
        aria-label={label}
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
})

interface RecentlyPlayedListProps {
  items: readonly RecentPlay[]
  /** URL lagu yang sedang aktif di pemutar (null jika tidak ada). */
  currentTrackUrl: string | null
  /** Status playback untuk lagu aktif (dari `getRowActivity`). */
  currentActivity: RowActivity
  onPlay: (entry: RecentPlay) => void
}

export default function RecentlyPlayedList({
  items,
  currentTrackUrl,
  currentActivity,
  onPlay,
}: RecentlyPlayedListProps) {
  return (
    <ul className="-mx-2" aria-label="Lagu yang baru diputar">
      {items.map((entry) => (
        <RecentRow
          key={recentKey(entry.track)}
          entry={entry}
          activity={currentTrackUrl !== null && entry.track.url === currentTrackUrl ? currentActivity : 'none'}
          onPlay={onPlay}
        />
      ))}
    </ul>
  )
}
