import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audioEngine, AudioEngineError, mediaErrorToCode, type AudioEngineEvent } from '../services/audioEngine'
import { fetchPlaybackInfo, SpotifyApiError } from '../services/spotifyApi'
import type {
  AudioPlayerActions,
  AudioPlayerState,
  PlaybackStatus,
  PlaybackTime,
  PlayerErrorCode,
  PlayerQueueState,
} from '../types/player'
import type { PlayAllHandler, PlaybackInfo, PlaylistTrack, PlayTrackHandler } from '../types/spotify'
import {
  getNextIndex,
  getPreviousIndex,
  hasNext,
  hasPrevious,
  isValidIndex,
  NO_TRACKS,
  resolveQueueForPlayAll,
  resolveQueueForTrack,
} from '../utils/playerQueue'

/** Batas menunggu event `playing` pertama setelah URL audio didapat. */
export const START_TIMEOUT_MS = 30_000

const initialState: AudioPlayerState = {
  status: 'idle',
  currentTrack: null,
  queue: NO_TRACKS,
  currentIndex: null,
  playbackInfo: null,
  error: null,
}
const initialTime: PlaybackTime = { currentTime: 0, duration: null, seekable: false }

/** Seek hanya bermakna saat audio sudah memuat dan belum selesai. */
const SEEKABLE_STATUSES: PlaybackStatus[] = ['playing', 'buffering', 'paused']
/** Di atas ini, tombol Previous mengulang lagu dari awal (jika bisa di-seek). */
const RESTART_THRESHOLD_S = 3

function errorMessage(code: PlayerErrorCode): string {
  switch (code) {
    case 'resolve_failed':
      return 'Tidak dapat mengambil audio untuk lagu ini. Coba lagi.'
    case 'no_audio':
      return 'Server tidak menyediakan audio untuk lagu ini.'
    case 'blocked':
      return 'Browser memblokir pemutaran. Tekan tombol Play sekali lagi.'
    case 'network':
      return 'Audio gagal diunduh. Periksa koneksi internet, atau tautan audio sudah kedaluwarsa. Coba lagi untuk mengambil tautan baru.'
    case 'unsupported':
      return 'Audio tidak dapat diputar: format tidak didukung, tautan sudah kedaluwarsa, atau tautan bukan file audio langsung (mis. halaman unduhan). Coba lagi untuk mengambil tautan baru.'
    case 'decode':
      return 'File audio rusak atau tidak dapat didekode browser.'
    case 'timeout':
      return `Audio tidak mulai diputar dalam ${Math.round(START_TIMEOUT_MS / 1000)} detik. Tautan mungkin lambat atau kedaluwarsa. Coba lagi.`
    default:
      return 'Audio gagal diputar karena kesalahan yang tidak diketahui.'
  }
}

const ACTIVE_STATUSES: PlaybackStatus[] = ['playing', 'buffering', 'loading']

/**
 * Logika playback. Dipanggil SEKALI oleh AudioPlayerProvider; komponen memakai
 * `useAudioPlayer()` agar semuanya berbagi satu state dan satu audio engine.
 */
export function useAudioPlayerController(playlistTracks: PlaylistTrack[]) {
  const [state, setState] = useState<AudioPlayerState>(initialState)
  const [time, setTime] = useState<PlaybackTime>(initialTime)

  // Lagu playlist aktif. Hanya dipakai untuk membentuk queue saat pengguna memilih lagu;
  // queue yang sedang berjalan disimpan di `state.queue` (+ `state.currentIndex`).
  const playlistTracksRef = useRef(playlistTracks)
  useEffect(() => {
    playlistTracksRef.current = playlistTracks
  }, [playlistTracks])
  // Diisi setelah `playAt` didefinisikan; dipakai handler event `ended` untuk auto-next.
  const playAtRef = useRef<(index: number) => void>(() => {})
  const timeRef = useRef<PlaybackTime>(initialTime)
  const updateTime = useCallback((next: (prev: PlaybackTime) => PlaybackTime) => {
    const value = next(timeRef.current)
    if (value === timeRef.current) return
    timeRef.current = value
    setTime(value)
  }, [])

  // stateRef adalah sumber kebenaran untuk aksi/event; setState hanya memicu render.
  const stateRef = useRef<AudioPlayerState>(initialState)
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = useCallback((patch: Partial<AudioPlayerState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    setState(stateRef.current)
  }, [])

  const setStatus = useCallback(
    (status: PlaybackStatus) => {
      if (stateRef.current.status !== status) commit({ status })
    },
    [commit],
  )

  const clearStartTimer = useCallback(() => {
    if (startTimerRef.current !== null) {
      clearTimeout(startTimerRef.current)
      startTimerRef.current = null
    }
  }, [])

  const fail = useCallback(
    (code: PlayerErrorCode, message?: string) => {
      clearStartTimer()
      // Event `error` dan penolakan play() bisa datang berurutan; ambil yang pertama.
      if (stateRef.current.status === 'error') return
      audioEngine.stop()
      commit({ status: 'error', error: { code, message: message ?? errorMessage(code) } })
    },
    [clearStartTimer, commit],
  )

  /** Event dari HTMLAudioElement: satu-satunya jalan menuju status playing/paused/buffering/ended. */
  const handleEngineEvent = useCallback(
    (event: AudioEngineEvent) => {
      const { status } = stateRef.current
      switch (event.type) {
        case 'play':
          // play() diminta lagi (mis. lanjut dari jeda). Belum berarti suara berjalan.
          if (status === 'paused' || status === 'ended') setStatus('loading')
          break
        case 'playing':
          clearStartTimer()
          if (status !== 'playing') commit({ status: 'playing', error: null })
          break
        case 'waiting':
          if (status === 'playing') setStatus('buffering')
          break
        case 'pause':
          // Saat lagu selesai browser mengirim `pause` lalu `ended`; biarkan `ended` yang menentukan.
          if (event.ended) break
          if (ACTIVE_STATUSES.includes(status)) {
            clearStartTimer()
            setStatus('paused')
          }
          break
        case 'timeupdate':
        case 'durationchange':
        case 'loadedmetadata':
        case 'progress':
        case 'seeked':
          updateTime((prev) =>
            prev.currentTime === event.currentTime &&
            prev.duration === event.duration &&
            prev.seekable === event.seekable
              ? prev
              : { currentTime: event.currentTime, duration: event.duration, seekable: event.seekable },
          )
          break
        case 'ended': {
          clearStartTimer()
          // Lanjut otomatis ke lagu berikutnya di queue; di lagu terakhir berhenti di status `ended`.
          const { queue, currentIndex } = stateRef.current
          const next = getNextIndex(queue, currentIndex)
          if (next !== null) {
            playAtRef.current(next)
            break
          }
          setStatus('ended')
          updateTime((prev) => ({
            currentTime: event.duration ?? prev.currentTime,
            duration: event.duration ?? prev.duration,
            seekable: event.seekable,
          }))
          break
        }
        case 'error': {
          const code = mediaErrorToCode(event.mediaErrorCode)
          if (code) fail(code)
          break
        }
      }
    },
    [clearStartTimer, commit, fail, setStatus, updateTime],
  )

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(handleEngineEvent)
    return () => {
      unsubscribe()
      requestIdRef.current++
      controllerRef.current?.abort()
      controllerRef.current = null
      clearStartTimer()
      audioEngine.dispose()
    }
  }, [handleEngineEvent, clearStartTimer])

  /**
   * Memulai lagu `queue[index]` dan menyimpan queue + indeksnya di state dalam satu commit,
   * sehingga posisi playback tidak pernah lepas dari queue-nya.
   */
  const startPlayback = useCallback(
    (queue: readonly PlaylistTrack[], index: number) => {
      const track = queue[index]
      if (!track) return
      // Harus sinkron di dalam gestur klik (lihat AudioEngine.prime). Juga menghentikan lagu lama.
      audioEngine.prime()
      clearStartTimer()
      controllerRef.current?.abort()

      const controller = new AbortController()
      controllerRef.current = controller
      const requestId = ++requestIdRef.current
      const isStale = () => requestIdRef.current !== requestId

      commit({ status: 'resolving', currentTrack: track, queue, currentIndex: index, playbackInfo: null, error: null })
      updateTime(() => initialTime)

      void (async () => {
        // Setiap permintaan play selalu mengambil mp3_url terbaru (tanpa cache).
        let info: PlaybackInfo
        try {
          info = await fetchPlaybackInfo(track, { signal: controller.signal })
        } catch (error) {
          if (isStale()) return
          if (error instanceof SpotifyApiError) {
            if (error.code === 'aborted') return
            fail(error.code === 'no_audio' ? 'no_audio' : 'resolve_failed', error.message)
          } else {
            fail('resolve_failed')
          }
          return
        }
        if (isStale()) return

        // URL sudah ada, tetapi BELUM tentu bisa diputar: tetap "loading" sampai event `playing`.
        commit({ status: 'loading', playbackInfo: info })
        clearStartTimer()
        startTimerRef.current = setTimeout(() => {
          if (!isStale() && stateRef.current.status === 'loading') fail('timeout')
        }, START_TIMEOUT_MS)

        try {
          await audioEngine.load(info.audioUrl)
        } catch (error) {
          if (isStale()) return
          const code = error instanceof AudioEngineError ? error.code : 'unknown'
          if (code === 'aborted') return // dijeda/diganti saat play() menunggu
          fail(code)
        }
      })()
    },
    [clearStartTimer, commit, fail, updateTime],
  )

  /** Lagu dipilih pengguna: putar langsung, queue disesuaikan dengan playlist aktif. */
  const playTrack = useCallback<PlayTrackHandler>(
    (track, index) => {
      const { tracks, index: resolved } = resolveQueueForTrack(playlistTracksRef.current, track, index)
      startPlayback(tracks, resolved)
    },
    [startPlayback],
  )

  /** Play All: queue = seluruh lagu yang diberikan, mulai dari yang pertama. */
  const playAll = useCallback<PlayAllHandler>(
    (tracks) => {
      const resolved = resolveQueueForPlayAll(tracks)
      if (resolved) startPlayback(resolved.tracks, resolved.index)
    },
    [startPlayback],
  )

  const togglePlayPause = useCallback(() => {
    const { status, queue, currentIndex } = stateRef.current
    switch (status) {
      case 'playing':
      case 'buffering':
      case 'loading':
        audioEngine.pause() // status berubah lewat event `pause`
        break
      case 'paused': {
        const requestId = requestIdRef.current
        audioEngine.resume().catch((error: unknown) => {
          if (requestIdRef.current !== requestId) return
          const code = error instanceof AudioEngineError ? error.code : 'unknown'
          if (code !== 'aborted') fail(code)
        })
        break
      }
      case 'ended':
      case 'error':
        // Tautan lama bisa sudah kedaluwarsa: minta yang baru.
        if (currentIndex !== null) startPlayback(queue, currentIndex)
        break
      default:
        break // idle / resolving
    }
  }, [fail, startPlayback])

  const selectTrack = useCallback<PlayTrackHandler>(
    (track, index) => {
      const { status, currentTrack } = stateRef.current
      if (currentTrack?.id === track.id) {
        if (status === 'resolving') return
        if (status === 'paused' || ACTIVE_STATUSES.includes(status)) {
          togglePlayPause()
          return
        }
      }
      playTrack(track, index)
    },
    [playTrack, togglePlayPause],
  )

  const cleanup = useCallback(() => {
    requestIdRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    clearStartTimer()
    audioEngine.stop()
    if (stateRef.current !== initialState) {
      stateRef.current = initialState
      setState(initialState)
    }
    updateTime(() => initialTime)
  }, [clearStartTimer, updateTime])

  const retry = useCallback(() => {
    const { status, queue, currentIndex } = stateRef.current
    if ((status === 'error' || status === 'ended') && currentIndex !== null) {
      startPlayback(queue, currentIndex)
    }
  }, [startPlayback])

  const seekTo = useCallback(
    (seconds: number) => {
      if (!SEEKABLE_STATUSES.includes(stateRef.current.status)) return
      const applied = audioEngine.seek(seconds)
      if (applied !== null) updateTime((prev) => ({ ...prev, currentTime: applied }))
    },
    [updateTime],
  )

  /** Memutar lagu pada posisi `index` di queue yang sedang berjalan (queue tidak diganti). */
  const playAt = useCallback(
    (index: number) => {
      startPlayback(stateRef.current.queue, index)
    },
    [startPlayback],
  )
  useEffect(() => {
    playAtRef.current = playAt
  }, [playAt])

  const playNext = useCallback(() => {
    const { queue, currentIndex } = stateRef.current
    const next = getNextIndex(queue, currentIndex)
    if (next !== null) playAt(next)
  }, [playAt])

  const playQueueItem = useCallback(
    (index: number) => {
      if (isValidIndex(stateRef.current.queue, index)) playAt(index)
    },
    [playAt],
  )

  const playPrevious = useCallback(() => {
    const { queue, currentIndex, status } = stateRef.current
    const { currentTime, seekable } = timeRef.current
    const inTrack = SEEKABLE_STATUSES.includes(status)
    const previous = getPreviousIndex(queue, currentIndex)
    if (inTrack && currentTime > RESTART_THRESHOLD_S) {
      // Lagu sudah berjalan > 3 detik: ulang lagu ini. Bila audio tidak bisa di-seek,
      // muat ulang dari awal (URL baru) agar hasilnya tetap sama.
      if (seekable) seekTo(0)
      else if (currentIndex !== null) startPlayback(queue, currentIndex)
    } else if (previous !== null) {
      playAt(previous)
    } else if (inTrack && seekable) {
      seekTo(0)
    }
  }, [playAt, seekTo, startPlayback])

  const actions = useMemo<AudioPlayerActions>(
    () => ({
      playTrack,
      selectTrack,
      playAll,
      playQueueItem,
      togglePlayPause,
      playNext,
      playPrevious,
      seekTo,
      retry,
      cleanup,
    }),
    [playTrack, selectTrack, playAll, playQueueItem, togglePlayPause, playNext, playPrevious, seekTo, retry, cleanup],
  )

  const { queue, currentIndex } = state
  const queueState = useMemo<PlayerQueueState>(
    () => ({ hasPrevious: hasPrevious(queue, currentIndex), hasNext: hasNext(queue, currentIndex) }),
    [queue, currentIndex],
  )

  return { state, time, queueState, actions }
}
