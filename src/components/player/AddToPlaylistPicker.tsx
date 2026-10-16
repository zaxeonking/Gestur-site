import { Check, ChevronLeft, ListMusic, Plus } from 'lucide-react'
import { useState } from 'react'
import { myPlaylistErrorText, useMyPlaylists } from '../../context/MyPlaylistsContext'
import type { PlaylistTrack } from '../../types/spotify'
import { trackIdentity } from '../../utils/myPlaylistStorage'
import NewPlaylistForm from '../library/NewPlaylistForm'
import Action from './SheetAction'

interface AddToPlaylistPickerProps {
  track: PlaylistTrack
  onBack: () => void
  onDone: (message: string) => void
}

/** Pilihan playlist untuk menyimpan satu lagu: pilih yang ada, atau buat baru langsung dengan lagu ini. */
export default function AddToPlaylistPicker({ track, onBack, onDone }: AddToPlaylistPickerProps) {
  const { playlists, addTrack, createPlaylist } = useMyPlaylists()
  const [creating, setCreating] = useState(playlists.length === 0)
  const identity = trackIdentity(track)

  const addTo = (id: string, name: string) => {
    const result = addTrack(id, track)
    onDone(result.ok ? `Disimpan ke “${name}”` : myPlaylistErrorText(result.reason))
  }

  const create = (name: string): string | null => {
    const made = createPlaylist(name)
    if (!made.ok) return myPlaylistErrorText(made.reason)
    const added = addTrack(made.value.id, track)
    onDone(added.ok ? `Playlist “${made.value.name}” dibuat dan lagu disimpan` : myPlaylistErrorText(added.reason))
    return null
  }

  return (
    <div>
      <div className="flex items-center gap-1 px-2 pb-2">
        <button type="button" onClick={onBack} aria-label="Kembali ke opsi lagu" className="icon-btn">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-ink">Simpan ke playlist saya</p>
      </div>
      <ul className="max-h-[40dvh] overflow-y-auto border-t border-line px-2 pt-2">
        {playlists.map((playlist) => {
          const has = playlist.tracks.some((item) => trackIdentity(item) === identity)
          return (
            <Action
              key={playlist.id}
              icon={has ? Check : ListMusic}
              label={playlist.name}
              hint={has ? 'Lagu ini sudah ada di sini' : `${playlist.tracks.length} lagu`}
              onClick={() => addTo(playlist.id, playlist.name)}
              disabled={has}
            />
          )
        })}
      </ul>
      <div className="border-t border-line px-4 pt-3">
        {creating ? (
          <NewPlaylistForm onCreate={create} onCancel={playlists.length > 0 ? () => setCreating(false) : undefined} submitLabel="Buat & simpan" />
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="btn-secondary h-11 w-full text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Playlist baru
          </button>
        )}
      </div>
    </div>
  )
}
