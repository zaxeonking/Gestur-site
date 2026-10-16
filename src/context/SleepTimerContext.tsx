/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

interface SleepTimerApi {
  /** Waktu (ms epoch) timer menit berakhir; null jika tidak ada timer menit. */
  endsAt: number | null
  /** Berhenti saat lagu yang sedang diputar selesai. */
  atTrackEnd: boolean
  active: boolean
  startMinutes: (minutes: number) => void
  startAtTrackEnd: () => void
  cancel: () => void
}

const SleepTimerContext = createContext<SleepTimerApi | null>(null)

/**
 * Sleep timer. Berada di atas halaman, jadi tetap berjalan saat pemutar penuh ditutup. Saat waktunya habis,
 * musik DIJEDA (bisa dilanjutkan). Mode "akhir lagu" ditangani pemutar sendiri (`stopAfterTrack`).
 * Harus berada di dalam <AudioPlayerProvider>.
 */
export function SleepTimerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer()
  const { pause, setStopAfterTrack, stopAfterTrack } = player
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const pauseRef = useRef(pause)
  useEffect(() => {
    pauseRef.current = pause
  }, [pause])

  useEffect(() => {
    if (endsAt === null) return
    const fire = () => {
      pauseRef.current()
      setEndsAt(null)
    }
    // Tab di background bisa menunda setTimeout; cek ulang waktunya saat tab kembali terlihat.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() >= endsAt) fire()
    }
    const timer = window.setTimeout(fire, Math.max(0, endsAt - Date.now()))
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])

  const startMinutes = useCallback(
    (minutes: number) => {
      setStopAfterTrack(false)
      setEndsAt(Date.now() + minutes * 60_000)
    },
    [setStopAfterTrack],
  )
  const startAtTrackEnd = useCallback(() => {
    setEndsAt(null)
    setStopAfterTrack(true)
  }, [setStopAfterTrack])
  const cancel = useCallback(() => {
    setEndsAt(null)
    setStopAfterTrack(false)
  }, [setStopAfterTrack])

  const value = useMemo<SleepTimerApi>(
    () => ({
      endsAt,
      atTrackEnd: stopAfterTrack,
      active: endsAt !== null || stopAfterTrack,
      startMinutes,
      startAtTrackEnd,
      cancel,
    }),
    [endsAt, stopAfterTrack, startMinutes, startAtTrackEnd, cancel],
  )

  return <SleepTimerContext.Provider value={value}>{children}</SleepTimerContext.Provider>
}

export function useSleepTimer(): SleepTimerApi {
  const api = useContext(SleepTimerContext)
  if (!api) throw new Error('useSleepTimer harus dipakai di dalam <SleepTimerProvider>.')
  return api
}
