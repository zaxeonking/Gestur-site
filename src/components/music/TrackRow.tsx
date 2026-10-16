import type { Track } from '../../types'
import { extractTrackId } from '../../utils/spotifyUrl'
import CoverArt from '../ui/CoverArt'

export default function TrackRow({ track }: { track: Track }) {
  // Judul menjadi tautan hanya untuk URL lagu Spotify yang valid.
  const href = track.url && extractTrackId(track.url) ? track.url : undefined

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2">
      <div className="w-12 shrink-0">
        <CoverArt cover={track.cover} src={track.coverUrl} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-ink">
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
        <p className="truncate text-sm text-ink-muted">{track.artist}</p>
      </div>
      <p className="hidden w-48 truncate text-sm text-ink-muted md:block">{track.album}</p>
      <p className="w-10 text-right text-sm tabular-nums text-ink-muted">{track.duration}</p>
    </li>
  )
}
