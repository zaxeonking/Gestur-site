import { Music2, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TrackList from '../components/playlist/TrackList'
import EmptyState from '../components/ui/EmptyState'
import SectionHeader from '../components/ui/SectionHeader'
import { useLibrary } from '../context/LibraryContext'
import { usePlaylist } from '../context/PlaylistContext'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { collectAllSongs } from '../utils/allSongs'
import { getRowActivity } from '../utils/playerStatus'

/**
 * Halaman Cari: satu daftar "All Songs" dari semua lagu yang benar-benar ada di perangkat
 * (playlist aktif + Koleksi + riwayat putar). Kolom pencarian menyaring daftar itu berdasarkan
 * judul dan nama artis; kolom kosong = semua lagu tampil lagi. Tidak ada data contoh.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const { playlist, status } = usePlaylist()
  const { saved, recent } = useLibrary()
  const player = useAudioPlayer()

  const songs = useMemo(
    () =>
      collectAllSongs([
        playlist?.tracks ?? [],
        ...saved.map((item) => item.tracks),
        recent.map((item) => item.track),
      ]),
    [playlist, saved, recent],
  )

  const emptyState =
    status === 'loading' ? (
      <EmptyState
        icon={Music2}
        title="Memuat lagu…"
        description="Playlist sedang dimuat. Daftar lagu muncul setelah selesai."
      />
    ) : (
      <EmptyState
        icon={Music2}
        title="Belum ada lagu"
        description="Muat lagu atau playlist Spotify di Beranda, atau simpan ke Koleksi. Semua lagumu akan muncul di sini."
        action={
          <Link to="/" className="btn-primary">
            Ke Beranda
          </Link>
        }
      />
    )

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">Cari</h1>

      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 py-2 lg:-mx-8 lg:px-8">
        <label htmlFor="search-input" className="sr-only">
          Cari lagu berdasarkan judul atau artis
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Judul lagu atau artis"
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full rounded-full bg-raised pl-12 pr-12 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Hapus pencarian"
              className="icon-btn absolute right-0.5 top-1/2 -translate-y-1/2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <section aria-label="All Songs">
        <SectionHeader
          title="All Songs"
          subtitle={songs.length > 0 ? `${songs.length} lagu` : undefined}
        />
        <TrackList
          tracks={songs}
          query={query}
          onQueryChange={setQuery}
          includeAlbum={false}
          emptyState={emptyState}
          onPlay={player.selectTrack}
          playingTrackId={player.currentTrack?.id ?? null}
          playbackActivity={getRowActivity(player.status)}
        />
      </section>
    </div>
  )
}
