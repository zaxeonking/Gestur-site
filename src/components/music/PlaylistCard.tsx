import type { Playlist } from '../../types'
import CoverArt from '../ui/CoverArt'

export default function PlaylistCard({ playlist }: { playlist: Playlist }) {
  return (
    <article className="w-40 shrink-0 snap-start rounded-lg bg-card p-3 sm:w-44 lg:w-48">
      <div className="relative mb-3">
        <CoverArt cover={playlist.cover} className="shadow-lg shadow-black/40" />
      </div>
      <h3 className="truncate font-display text-base font-bold text-ink">{playlist.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{playlist.description}</p>
    </article>
  )
}
