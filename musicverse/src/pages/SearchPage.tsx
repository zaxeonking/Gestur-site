import { Search, SearchX, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import ArtistCard from '../components/music/ArtistCard'
import GenreTile from '../components/music/GenreTile'
import HorizontalRow from '../components/music/HorizontalRow'
import PlaylistCard from '../components/music/PlaylistCard'
import TrackRow from '../components/music/TrackRow'
import EmptyState from '../components/ui/EmptyState'
import SectionHeader from '../components/ui/SectionHeader'
import { usePlaylist } from '../context/PlaylistContext'
import { artists, genres, playlists, tracks } from '../data/mock'
import type { Artist, Playlist } from '../types'
import { toUiTrack } from '../utils/playlistMapper'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const keyword = query.trim().toLowerCase()
  const { isLive, playlist, status } = usePlaylist()

  const liveTracks = useMemo(() => (playlist ? playlist.tracks.map(toUiTrack) : []), [playlist])

  const results = useMemo(() => {
    if (!keyword) return null
    const has = (value: string) => value.toLowerCase().includes(keyword)
    const matchTrack = (t: { title: string; artist: string; album: string }) =>
      has(t.title) || has(t.artist) || has(t.album)

    // Saat API dipakai, pencarian hanya menelusuri lagu dari playlist yang dimuat.
    if (isLive) {
      return {
        tracks: liveTracks.filter(matchTrack),
        artists: [] as Artist[],
        playlists: [] as Playlist[],
      }
    }
    return {
      tracks: tracks.filter(matchTrack),
      artists: artists.filter((a) => has(a.name)),
      playlists: playlists.filter((p) => has(p.title) || has(p.description)),
    }
  }, [keyword, isLive, liveTracks])

  const liveHint = playlist
    ? `Ketik judul lagu, artis, atau album dari “${playlist.title}”.`
    : status === 'loading'
      ? 'Playlist sedang dimuat. Pencarian siap setelah selesai.'
      : 'Playlist belum dimuat. Impor tautan playlist Spotify di Beranda.'

  const total = results ? results.tracks.length + results.artists.length + results.playlists.length : 0

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Cari</h1>

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-bg px-4 py-2 lg:top-0 lg:-mx-8 lg:px-8">
        <label htmlFor="search-input" className="sr-only">
          Cari lagu, artis, atau playlist
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
            placeholder={isLive ? 'Judul lagu, artis, atau album' : 'Lagu, artis, atau playlist'}
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

      {!results && isLive && (
        <EmptyState icon={Search} title="Cari di playlist" description={liveHint} />
      )}

      {!results && !isLive && (
        <section aria-label="Jelajahi genre">
          <SectionHeader title="Jelajahi genre" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {genres.map((genre) => (
              <GenreTile key={genre.id} genre={genre} />
            ))}
          </div>
        </section>
      )}

      {results && total === 0 && (
        <EmptyState
          icon={SearchX}
          title={`Tidak ada hasil untuk “${query.trim()}”`}
          description="Periksa ejaan kata kunci, atau coba nama artis dan judul lagu lain."
        />
      )}

      {results && results.tracks.length > 0 && (
        <section aria-label="Lagu">
          <SectionHeader title="Lagu" />
          <ul className="-mx-2">
            {results.tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </ul>
        </section>
      )}

      {results && results.artists.length > 0 && (
        <section aria-label="Artis">
          <SectionHeader title="Artis" />
          <HorizontalRow>
            {results.artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </HorizontalRow>
        </section>
      )}

      {results && results.playlists.length > 0 && (
        <section aria-label="Playlist">
          <SectionHeader title="Playlist" />
          <HorizontalRow>
            {results.playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </HorizontalRow>
        </section>
      )}
    </div>
  )
}
