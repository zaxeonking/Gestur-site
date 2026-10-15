import { AlertCircle, ListMusic, RotateCw } from 'lucide-react'
import { usePlaylist } from '../../context/PlaylistContext'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { getRowActivity } from '../../utils/playerStatus'
import EmptyState from '../ui/EmptyState'
import PlaylistHeader from './PlaylistHeader'
import PlaylistSkeleton from './PlaylistSkeleton'
import TrackList from './TrackList'

/** Tombol ini benar-benar mengulang permintaan terakhir lewat context. */
function RetryButton() {
  const { retry } = usePlaylist()
  return (
    <button
      type="button"
      onClick={() => void retry()}
      className="btn-primary"
    >
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      Coba lagi
    </button>
  )
}

/** Detail teknis error; teks bisa dipilih/disalin untuk dikirim saat melapor masalah. */
function ErrorDetail({ detail }: { detail?: string | null }) {
  if (!detail) return null
  return (
    <details className="w-full max-w-md text-left text-xs text-ink-muted" open>
      <summary className="cursor-pointer select-none">Detail teknis</summary>
      <pre className="mt-2 select-text whitespace-pre-wrap break-all rounded-md bg-bg p-3 font-mono">{detail}</pre>
    </details>
  )
}

/** Menampilkan playlist dari API: kosong, memuat, gagal, atau daftar lagu. */
export default function PlaylistView() {
  const { status, playlist, error, errorDetail, fromCache, canRetry, loadPlaylist } = usePlaylist()
  const player = useAudioPlayer()

  if (status === 'loading') return <PlaylistSkeleton />

  if (!playlist) {
    if (status === 'error') {
      return (
        <EmptyState
          icon={AlertCircle}
          tone="error"
          title="Playlist gagal dimuat"
          description={error ?? 'Terjadi kesalahan. Coba lagi.'}
          action={
            <div className="flex flex-col items-center gap-4">
              {canRetry && <RetryButton />}
              <ErrorDetail detail={errorDetail} />
            </div>
          }
        />
      )
    }
    return (
      <EmptyState
        icon={ListMusic}
        title="Belum ada playlist"
        description="Tempel tautan playlist Spotify di kolom atas, lalu pilih Muat playlist. Playlist harus bersifat publik."
      />
    )
  }

  return (
    <section aria-label={`Playlist ${playlist.title}`} className="space-y-6">
      {status === 'error' && error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-card px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <span>
              {error} <span className="text-ink-muted">Playlist sebelumnya tetap ditampilkan.</span>
            </span>
          </p>
          {canRetry && <RetryButton />}
          <ErrorDetail detail={errorDetail} />
        </div>
      )}

      <PlaylistHeader
        title={playlist.title}
        cover={playlist.cover}
        author={playlist.author}
        trackCount={playlist.tracks.length}
        fromCache={fromCache}
        onPlayAll={() => player.playAll(playlist.tracks)}
        onReload={() => void loadPlaylist(playlist.url)}
      />

      <TrackList
        key={playlist.id}
        tracks={playlist.tracks}
        onPlay={player.selectTrack}
        playingTrackId={player.currentTrack?.id ?? null}
        playbackActivity={getRowActivity(player.status)}
      />
    </section>
  )
}
