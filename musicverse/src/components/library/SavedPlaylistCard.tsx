import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryView, SavedPlaylist } from '../../types/library'
import { fallbackCover } from '../../utils/fallbackCover'
import CoverArt from '../ui/CoverArt'

interface SavedPlaylistCardProps {
  playlist: SavedPlaylist
  layout: LibraryView
  /** True jika ini playlist yang sedang dibuka di Beranda. */
  active: boolean
  onOpen: (playlist: SavedPlaylist) => void
  onRemove: (playlist: SavedPlaylist) => void
}

/**
 * Satu playlist tersimpan. Menghapus butuh konfirmasi di tempat (bukan dialog) agar sentuhan
 * yang tidak sengaja tidak langsung menghapus. Yang dihapus hanya salinan di Koleksi.
 */
export default function SavedPlaylistCard({ playlist, layout, active, onOpen, onRemove }: SavedPlaylistCardProps) {
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const trashRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const fallback = useMemo(() => fallbackCover(playlist.title), [playlist.title])

  // Fokus mengikuti perubahan tombol: ke "Batal" saat konfirmasi muncul, kembali ke ikon hapus saat dibatalkan.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) trashRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  const count = playlist.tracks.length
  const subtitle = `${count} lagu${playlist.author ? ` · ${playlist.author}` : ''}`

  const actions = confirming ? (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Konfirmasi hapus ${playlist.title}`}>
      <span className="text-sm text-ink-muted">Hapus dari Koleksi?</span>
      <button
        ref={cancelRef}
        type="button"
        onClick={() => setConfirming(false)}
        className="btn-secondary px-4"
      >
        Batal
      </button>
      <button
        type="button"
        onClick={() => onRemove(playlist)}
        aria-label={`Hapus ${playlist.title} dari Koleksi`}
        className="btn-danger px-4"
      >
        Hapus
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpen(playlist)}
        aria-label={`Buka playlist ${playlist.title}`}
        className="btn-primary"
      >
        Buka
      </button>
      <button
        ref={trashRef}
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Hapus ${playlist.title} dari Koleksi`}
        className="icon-btn bg-raised hover:text-danger"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )

  const badge = active ? (
    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
      Sedang dibuka
    </span>
  ) : null

  if (layout === 'list') {
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-2 py-2 transition-colors hover:bg-raised">
        <div className="w-14 shrink-0">
          <CoverArt cover={fallback} src={playlist.cover} />
        </div>
        <div className="min-w-0 flex-1 basis-40">
          <p className="flex items-center gap-2">
            <span title={playlist.title} className="min-w-0 truncate font-medium text-ink">{playlist.title}</span>
            {badge}
          </p>
          <p className="truncate text-sm text-ink-muted">{subtitle}</p>
        </div>
        {actions}
      </li>
    )
  }

  return (
    <li className="flex flex-col rounded-lg bg-card p-3 transition-colors hover:bg-raised">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onOpen(playlist)}
        className="mb-3 block w-full rounded-md transition-opacity active:opacity-80"
      >
        <CoverArt cover={fallback} src={playlist.cover} className="shadow-lg shadow-black/40" />
      </button>
      <div className="min-w-0 flex-1">
        <h3 title={playlist.title} className="line-clamp-2 break-words font-display text-base font-bold leading-snug text-ink">
          {playlist.title}
        </h3>
        <p className="mt-1 line-clamp-2 break-words text-sm text-ink-muted">{subtitle}</p>
        {badge && <p className="mt-2">{badge}</p>}
      </div>
      <div className="mt-3">{actions}</div>
    </li>
  )
}
