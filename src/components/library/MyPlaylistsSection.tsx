import { ListMusic, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { myPlaylistErrorText, useMyPlaylists } from '../../context/MyPlaylistsContext'
import type { MyPlaylist } from '../../types/library'
import { fallbackCover } from '../../utils/fallbackCover'
import CoverArt from '../ui/CoverArt'
import EmptyState from '../ui/EmptyState'
import SectionHeader from '../ui/SectionHeader'
import NewPlaylistForm from './NewPlaylistForm'

function PlaylistCard({ playlist }: { playlist: MyPlaylist }) {
  const fallback = useMemo(() => fallbackCover(playlist.name), [playlist.name])
  const count = playlist.tracks.length
  return (
    <li>
      <Link
        to={`/my/${playlist.id}`}
        className="flex flex-col rounded-lg bg-card p-3 transition-colors hover:bg-raised focus-ring"
      >
        <span className="mb-3 block">
          <CoverArt cover={fallback} src={playlist.tracks[0]?.cover} className="shadow-lg shadow-black/40" />
        </span>
        <span title={playlist.name} className="line-clamp-2 break-words font-display text-base font-bold leading-snug text-ink">
          {playlist.name}
        </span>
        <span className="mt-1 text-sm text-ink-muted">{count === 0 ? 'Kosong' : `${count} lagu`}</span>
      </Link>
    </li>
  )
}

/** Bagian "Playlist saya" di halaman Koleksi: daftar playlist buatan sendiri + tombol buat baru. */
export default function MyPlaylistsSection() {
  const { playlists, createPlaylist } = useMyPlaylists()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const create = (name: string): string | null => {
    const result = createPlaylist(name)
    if (!result.ok) return myPlaylistErrorText(result.reason)
    setCreating(false)
    navigate(`/my/${result.value.id}`)
    return null
  }

  return (
    <section aria-label="Playlist saya">
      <SectionHeader
        title="Playlist saya"
        subtitle={playlists.length > 0 ? `${playlists.length} playlist buatanmu` : 'Playlist yang kamu buat dan isi sendiri'}
        action={
          !creating ? (
            <button type="button" onClick={() => setCreating(true)} className="btn-secondary h-10 px-4 text-sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Buat playlist
            </button>
          ) : undefined
        }
      />
      {creating && (
        <div className="mb-4 rounded-lg bg-card p-3">
          <NewPlaylistForm onCreate={create} onCancel={() => setCreating(false)} />
        </div>
      )}
      {playlists.length === 0 ? (
        !creating && (
          <EmptyState
            compact
            icon={ListMusic}
            title="Belum ada playlist buatanmu"
            description="Buat playlist, lalu tambahkan lagu lewat menu lagu (tahan lama pada lagu) atau tombol Simpan di pemutar."
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </ul>
      )}
    </section>
  )
}
