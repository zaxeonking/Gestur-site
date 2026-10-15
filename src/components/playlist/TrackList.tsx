import { ListMusic, Search, SearchX, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RowActivity } from '../../types/player'
import type { PlaylistTrack, PlayTrackHandler } from '../../types/spotify'
import { buildSearchIndex, filterSearchIndex } from '../../utils/trackSearch'
import EmptyState from '../ui/EmptyState'
import TrackRow, { TRACK_GRID } from './TrackRow'

interface TrackListProps {
  /** Seluruh lagu playlist, urutan asli dari API. */
  tracks: PlaylistTrack[]
  /** Menerima lagu dan posisi aslinya di `tracks` (aman dipakai sebagai indeks queue). */
  onPlay: PlayTrackHandler
  /** ID lagu yang sedang aktif di pemutar (atau null). */
  playingTrackId?: string | null
  /** Status playback untuk lagu aktif tersebut. */
  playbackActivity?: RowActivity
}

export default function TrackList({
  tracks,
  onPlay,
  playingTrackId = null,
  playbackActivity = 'none',
}: TrackListProps) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Simpan callback terbaru di ref agar baris tidak dirender ulang tiap parent render.
  const onPlayRef = useRef(onPlay)
  useEffect(() => {
    onPlayRef.current = onPlay
  }, [onPlay])

  const entries = useMemo(() => buildSearchIndex(tracks), [tracks])
  const visible = useMemo(() => filterSearchIndex(entries, query), [entries, query])
  const isFiltering = query.trim() !== ''

  const handlePlay = useCallback<PlayTrackHandler>((track, index) => {
    setSelectedId(track.id)
    onPlayRef.current(track, index)
  }, [])

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={ListMusic}
        title="Playlist ini belum punya lagu"
        description="Tambahkan lagu di Spotify, lalu klik Muat ulang."
      />
    )
  }

  return (
    <section aria-label="Daftar lagu" className="space-y-3">
      <div>
        <label htmlFor="track-filter" className="sr-only">
          Cari di playlist: judul, artis, atau album
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id="track-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul, artis, atau album"
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 w-full rounded-full bg-raised pl-12 pr-12 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Hapus pencarian"
              className="icon-btn absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 px-1 text-xs text-ink-muted">
          {isFiltering ? `${visible.length} dari ${tracks.length} lagu` : ''}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Tidak ada hasil untuk “${query.trim()}”`}
          description="Periksa ejaan, atau coba judul, artis, atau album lain."
          action={
            <button
              type="button"
              onClick={() => setQuery('')}
              className="btn-secondary"
            >
              Hapus pencarian
            </button>
          }
        />
      ) : (
        <div>
          <div
            aria-hidden="true"
            className={`${TRACK_GRID} mb-1 hidden border-b border-line px-2 pb-2 text-xs font-medium text-ink-faint sm:grid`}
          >
            <span className="text-center">#</span>
            <span />
            <span>Judul</span>
            <span className="hidden md:block">Album</span>
            <span className="text-right">Durasi</span>
            <span />
          </div>
          <ul className="-mx-2">
            {visible.map(({ track, index }) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                selected={track.id === selectedId}
                activity={track.id === playingTrackId ? playbackActivity : 'none'}
                onSelect={setSelectedId}
                onPlay={handlePlay}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
