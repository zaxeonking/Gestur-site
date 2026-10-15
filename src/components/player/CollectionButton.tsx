import { Heart } from 'lucide-react'
import { useMemo } from 'react'
import { useLibrary } from '../../context/LibraryContext'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { buildTrackCollectionEntry } from '../../utils/searchPlaylist'

interface CollectionButtonProps {
  /** `lg` dipakai di FullPlayer. */
  size?: 'sm' | 'lg'
  /** Pemanggil menentukan `display` (flex / hidden sm:flex, dst.) agar bisa responsif. */
  className?: string
}

/**
 * Tombol hati (ikon saja, tanpa teks) untuk tambah/hapus lagu yang sedang diputar dari Koleksi. Lagu disimpan sebagai entri satu lagu
 * (tanpa URL audio sementara). Status tombol mengikuti isi Koleksi yang sebenarnya, dan kegagalan
 * menyimpan (penyimpanan penuh, Koleksi penuh, dll.) ditampilkan lewat `notice` Koleksi.
 */
export default function CollectionButton({ size = 'sm', className = '' }: CollectionButtonProps) {
  const { currentTrack } = useAudioPlayer()
  const { savedIdFor, savePlaylist, removePlaylist } = useLibrary()
  const entry = useMemo(() => (currentTrack ? buildTrackCollectionEntry(currentTrack) : null), [currentTrack])
  if (!entry) return null

  const savedId = savedIdFor(entry)
  const isSaved = savedId !== null
  const label = isSaved ? 'Hapus dari Koleksi' : 'Tambah ke Koleksi'

  const toggle = () => {
    if (savedId !== null) removePlaylist(savedId)
    else savePlaylist(entry)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isSaved}
      aria-label={label}
      title={label}
      className={`${
        size === 'lg' ? 'h-11 w-11 hover:bg-white/10 active:bg-white/15' : 'h-11 w-11 hover:text-accent active:bg-white/10 lg:h-9 lg:w-9'
      } items-center justify-center rounded-full transition-colors focus-ring ${
        isSaved ? 'text-accent' : 'text-ink-muted hover:text-ink'
      } ${className}`}
    >
      <Heart
        className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'}
        fill={isSaved ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  )
}
