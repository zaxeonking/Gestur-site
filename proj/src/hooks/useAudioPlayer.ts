import { useContext, useMemo } from 'react'
import { PlaybackTimeContext, PlayerActionsContext, PlayerStateContext } from '../context/AudioPlayerContext'
import type { AudioPlayerActions, PlaybackTime, PlayerSnapshot } from '../types/player'

function missingProvider(): never {
  throw new Error('Hook pemutar harus dipakai di dalam <AudioPlayerProvider>.')
}

/**
 * Hook utama untuk komponen: status playback + aksi (playTrack, selectTrack,
 * togglePlayPause, seekTo, playNext/Previous, retry, cleanup). Semua pemakai berbagi satu state dan satu audio engine.
 * Tidak berisi `currentTime`; pakai `usePlaybackTime()` untuk itu.
 */
export function useAudioPlayer(): PlayerSnapshot & AudioPlayerActions {
  const state = useContext(PlayerStateContext)
  const actions = useContext(PlayerActionsContext)
  if (!state || !actions) missingProvider()
  return useMemo(() => ({ ...state, ...actions }), [state, actions])
}

/** Hanya aksi (identitas stabil): tidak render ulang saat status berubah. */
export function usePlayerActions(): AudioPlayerActions {
  const actions = useContext(PlayerActionsContext)
  if (!actions) missingProvider()
  return actions
}

/** Waktu berjalan dan durasi; berubah sekitar 4 kali per detik. */
export function usePlaybackTime(): PlaybackTime {
  const time = useContext(PlaybackTimeContext)
  if (!time) missingProvider()
  return time
}
