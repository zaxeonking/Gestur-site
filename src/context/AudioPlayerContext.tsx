/* eslint-disable react-refresh/only-export-components */
import { createContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAudioPlayerController } from '../hooks/useAudioPlayerController'
import type { AudioPlayerActions, PlaybackTime, PlayerSnapshot } from '../types/player'
import type { PlaylistTrack } from '../types/spotify'
import { usePlaylist } from './PlaylistContext'

export const PlayerStateContext = createContext<PlayerSnapshot | null>(null)
export const PlaybackTimeContext = createContext<PlaybackTime | null>(null)
export const PlayerActionsContext = createContext<AudioPlayerActions | null>(null)

/**
 * Satu-satunya pemilik audio engine dan state playback. Harus berada di dalam
 * <PlaylistProvider>. Konteks dipisah (state / waktu / aksi) agar komponen yang
 * hanya butuh aksi atau status tidak render ulang setiap `timeupdate`.
 */
const NO_TRACKS: PlaylistTrack[] = []

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const { playlist } = usePlaylist()
  const { state, time, queueState, actions } = useAudioPlayerController(playlist?.tracks ?? NO_TRACKS)
  const snapshot = useMemo<PlayerSnapshot>(() => ({ ...state, ...queueState }), [state, queueState])

  // Playlist dihapus atau diganti: hentikan audio agar tidak berjalan tanpa daftar lagunya.
  const playlistId = playlist?.id ?? null
  const { cleanup } = actions
  useEffect(() => {
    cleanup()
  }, [playlistId, cleanup])

  return (
    <PlayerActionsContext.Provider value={actions}>
      <PlayerStateContext.Provider value={snapshot}>
        <PlaybackTimeContext.Provider value={time}>{children}</PlaybackTimeContext.Provider>
      </PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  )
}
