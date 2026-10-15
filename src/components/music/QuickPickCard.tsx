import type { Playlist } from '../../types'
import CoverArt from '../ui/CoverArt'

export default function QuickPickCard({ playlist }: { playlist: Playlist }) {
  return (
    <article className="flex items-center gap-3 overflow-hidden rounded-md bg-card pr-3">
      <div className="w-14 shrink-0 sm:w-16">
        <CoverArt cover={playlist.cover} className="!rounded-none" />
      </div>
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink sm:text-base">
        {playlist.title}
      </h3>
    </article>
  )
}
