import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLyrics, LyricsError, type LyricsResult } from '../services/lyricsApi'
import type { PlaylistTrack } from '../types/spotify'

export type LyricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: LyricsResult }
  | { status: 'error'; message: string }

const CACHE_LIMIT = 40
/** Lirik yang sudah dicari (termasuk "tidak ditemukan") dipakai ulang selama sesi, tanpa memanggil server lagi. */
const cache = new Map<string, LyricsResult>()

function cacheKey(track: PlaylistTrack): string {
  return `${track.title}|${track.artists}|${track.album}`.toLowerCase()
}

/** Mengambil lirik untuk `track` selama `enabled`. Mengganti lagu membatalkan permintaan lama. */
export function useLyrics(track: PlaylistTrack | null, enabled: boolean): { state: LyricsState; retry: () => void } {
  const [state, setState] = useState<LyricsState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const trackRef = useRef(track)
  trackRef.current = track
  const key = track ? cacheKey(track) : null

  useEffect(() => {
    const current = trackRef.current
    if (!enabled || !current || !key) {
      setState({ status: 'idle' })
      return
    }
    const cached = cache.get(key)
    if (cached) {
      setState({ status: 'ready', result: cached })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    fetchLyrics(current, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
        cache.set(key, result)
        setState({ status: 'ready', result })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message: error instanceof LyricsError ? error.message : 'Lirik gagal dimuat karena kesalahan yang tidak diketahui.',
        })
      })
    return () => controller.abort()
  }, [enabled, key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
