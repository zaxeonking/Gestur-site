import { BookmarkCheck, BookmarkPlus, ListEnd, ListPlus, Play, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fallbackCover } from '../../utils/fallbackCover'
import { isSafeHttpUrl } from '../../utils/spotifyUrl'
import CoverArt from '../ui/CoverArt'

function HeaderBackdrop({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!isSafeHttpUrl(src) || failed) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-30 blur-3xl"
    />
  )
}

interface PlaylistHeaderProps {
  title: string
  cover: string
  trackCount: number
  /** True jika playlist dipulihkan dari penyimpanan perangkat. */
  fromCache?: boolean
  /** Play All: memutar seluruh lagu playlist berurutan (lihat `playAll` di audio engine). */
  onPlayAll: () => void
  /** Memuat ulang playlist dari API. */
  onReload?: () => void
  /** Status Koleksi: tombol menjadi Simpan (false) atau Hapus dari Koleksi (true). */
  isSaved?: boolean
  /** Menambah/menghapus dari Koleksi. Tombol disembunyikan jika tidak diberikan. */
  onToggleSaved?: () => void
  /** Menambahkan lagu ke "Playlist saya" (dipakai untuk hasil pencarian lagu satuan). */
  onAddToPlaylist?: () => void
  /** Menambahkan lagu ke antrean pemutar (hanya untuk hasil pencarian lagu satuan, bukan playlist). */
  onAddToQueue?: () => void
}

export default function PlaylistHeader({
  title,
  cover,
  trackCount,
  fromCache = false,
  onPlayAll,
  onReload,
  isSaved = false,
  onToggleSaved,
  onAddToPlaylist,
  onAddToQueue,
}: PlaylistHeaderProps) {
  const fallback = useMemo(() => fallbackCover(title), [title])

  return (
    <header className="relative isolate overflow-hidden rounded-lg bg-card p-4 sm:p-6">
      <HeaderBackdrop src={cover} />
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:gap-6 sm:text-left">
        <div className="w-40 shrink-0 sm:w-48 lg:w-56">
          <CoverArt cover={fallback} src={cover} className="shadow-2xl shadow-black/60" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Playlist</p>
          <h2 className="mt-1 line-clamp-3 text-balance break-words font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-6xl">
            {title}
          </h2>
          <p className="mt-3 text-sm text-ink">
            {trackCount} lagu
          </p>
          {fromCache && (
            <p className="mt-1 text-xs text-ink-muted">
              Dari penyimpanan di perangkat ini, mungkin belum yang terbaru. Tekan Muat ulang untuk memperbarui.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <button
              type="button"
              onClick={onPlayAll}
              disabled={trackCount === 0}
              className="btn-primary px-6"
            >
              <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              Putar semua
            </button>
            {onToggleSaved && (
              <button
                type="button"
                onClick={onToggleSaved}
                aria-pressed={isSaved}
                className="btn-secondary"
              >
                {isSaved ? (
                  <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                ) : (
                  <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
                )}
                {isSaved ? 'Hapus dari Koleksi' : 'Simpan ke Koleksi'}
              </button>
            )}
            {onAddToQueue && (
              <button type="button" onClick={onAddToQueue} className="btn-secondary">
                <ListEnd className="h-4 w-4" aria-hidden="true" />
                Tambah ke antrean
              </button>
            )}
            {onAddToPlaylist && (
              <button type="button" onClick={onAddToPlaylist} aria-haspopup="dialog" className="btn-secondary">
                <ListPlus className="h-4 w-4" aria-hidden="true" />
                Tambah ke playlist
              </button>
            )}
            {onReload && (
              <button
                type="button"
                onClick={onReload}
                className="btn-secondary"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Muat ulang
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
