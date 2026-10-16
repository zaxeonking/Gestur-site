import { useEffect, useRef } from 'react'
import type { PlaylistTrack } from '../../types/spotify'
import { fallbackCover } from '../../utils/fallbackCover'
import AddToPlaylistPicker from '../player/AddToPlaylistPicker'
import CoverArt from '../ui/CoverArt'

interface AddToPlaylistSheetProps {
  track: PlaylistTrack
  onClose: () => void
  onDone: (message: string) => void
}

/** Sheet bawah untuk menambahkan satu lagu ke "Playlist saya" (pilih yang ada atau buat baru). */
export default function AddToPlaylistSheet({ track, onClose, onDone }: AddToPlaylistSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const fallback = fallbackCover(track.title)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    sheetRef.current?.querySelector<HTMLElement>('button, input')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[62]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tambah ${track.title} ke playlist`}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md animate-sheet-up rounded-t-2xl border-t border-line bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 lg:bottom-6 lg:rounded-2xl lg:border"
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span className="w-12 shrink-0">
            <CoverArt cover={fallback} src={track.cover} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{track.title}</span>
            <span className="block truncate text-xs text-ink-muted">{track.artists}</span>
          </span>
        </div>
        <AddToPlaylistPicker
          track={track}
          onBack={onClose}
          onDone={(message) => {
            onDone(message)
            onClose()
          }}
        />
      </div>
    </div>
  )
}
