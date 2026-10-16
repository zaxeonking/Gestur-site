import type { Artist } from '../../types'
import CoverArt from '../ui/CoverArt'

export default function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <article className="w-36 shrink-0 snap-start rounded-lg bg-card p-3 sm:w-40 lg:w-44">
      <div className="mb-3">
        <CoverArt cover={artist.cover} round className="shadow-lg shadow-black/40" />
      </div>
      <h3 className="truncate font-display text-base font-bold text-ink">{artist.name}</h3>
      <p className="mt-0.5 text-sm text-ink-muted">Artis</p>
    </article>
  )
}
