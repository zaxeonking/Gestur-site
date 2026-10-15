import type { Genre } from '../../types'
import CoverArt from '../ui/CoverArt'

export default function GenreTile({ genre }: { genre: Genre }) {
  return (
    <button
      type="button"
      className="group relative aspect-[16/10] overflow-hidden rounded-lg text-left transition-transform active:scale-[0.98] focus-ring motion-reduce:active:scale-100"
    >
      <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none">
        <CoverArt cover={genre.cover} className="!aspect-auto !h-full !rounded-none" />
      </div>
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      <span className="absolute left-3 top-3 font-display text-lg font-bold text-white drop-shadow sm:text-xl">
        {genre.name}
      </span>
    </button>
  )
}
