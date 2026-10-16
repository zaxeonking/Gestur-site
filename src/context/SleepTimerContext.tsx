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

/** Volume mengecil pelan selama ini (ms) dan tepat senyap saat waktu timer habis. */
export const SLEEP_FADE_MS = 30_000

/**
 * Sleep timer. Berada di atas halaman, jadi tetap berjalan saat pemutar penuh ditutup. Volume mulai mengecil
 * `SLEEP_FADE_MS` sebelum waktunya habis; saat habis, musik DIJEDA (bisa dilanjutkan, volume kembali penuh). Mode "akhir lagu" ditangani pemutar sendiri (`stopAfterTrack`).
 * Harus berada di dalam <AudioPlayerProvider>.
 */
export function SleepTimerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer()
  const { pause, fadeOutAndPause, cancelFade, setStopAfterTrack, stopAfterTrack } = player
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const pauseRef = useRef(pause)
  const fadeRef = useRef(fadeOutAndPause)
  const cancelFadeRef = useRef(cancelFade)
  useEffect(() => {
    pauseRef.current = pause
    fadeRef.current = fadeOutAndPause
    cancelFadeRef.current = cancelFade
  }, [pause, fadeOutAndPause, cancelFade])

  useEffect(() => {
    if (endsAt === null) return
    const fire = () => {
      pauseRef.current()
      setEndsAt(null)
    }
    // Fade berakhir tepat di `endsAt`. Timer pendek (< SLEEP_FADE_MS) memudar selama sisa waktunya.
    let fadeTimer: number | undefined
    const startFade = () => {
      const left = endsAt - Date.now()
      if (left <= 0) fire()
      else fadeRef.current(left)
    }
    // Tab di background bisa menunda setTimeout; cek ulang waktunya saat tab kembali terlihat.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() >= endsAt) fire()
    }
    const untilFade = endsAt - Date.now() - SLEEP_FADE_MS
    if (untilFade <= 0) startFade()
    else fadeTimer = window.setTimeout(startFade, untilFade)
    const timer = window.setTimeout(fire, Math.max(0, endsAt - Date.now()))
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      // Timer diganti/dibatalkan di tengah fade: volume kembali penuh. (Setelah `fire`, jeda sudah mengembalikannya.)
      cancelFadeRef.current()
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
