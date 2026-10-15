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
  QueueAddResult,
  RepeatMode,
} from '../types/player'
import type { PlayAllHandler, PlaybackInfo, PlaylistTrack, PlayTrackHandler } from '../types/spotify'
import { readJson, writeJson } from '../utils/safeStorage'
import {
  createShuffleOrder,
  getNextIndex,
  getPreviousIndex,
  hasNext,
  hasPrevious,
  insertUpcomingTrack,
  isOrderUsable,
  isValidIndex,
  moveUpcomingTrack,
  NO_TRACKS,
  removeUpcomingTrack,
  type QueueEdit,
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
  shuffleOrder: null,
}
const initialTime: PlaybackTime = { currentTime: 0, duration: null, seekable: false }

interface StartOptions {
  /** Pertahankan urutan acak yang sedang berjalan (mis. lanjut ke lagu berikutnya). */
  keepOrder?: boolean
  /** Jangan reset hitungan ulang 1x (dipakai saat memuat ulang lagu yang sama untuk mengulang). */
  keepReplay?: boolean
}

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

const PREFS_KEY = 'musicverse.player.prefs.v1'
const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = { off: 'once', once: 'one', one: 'off' }

interface PlayerPrefs {
  shuffle: boolean
  repeat: RepeatMode
}

/** Preferensi acak/ulang disimpan di perangkat; data rusak atau storage terblokir = default. */
function loadPrefs(): PlayerPrefs {
  const result = readJson(PREFS_KEY)
  if (result.status !== 'ok' || typeof result.value !== 'object' || result.value === null) {
    return { shuffle: false, repeat: 'off' }
  }
  const { shuffle, repeat } = result.value as Record<string, unknown>
  return {
    shuffle: shuffle === true,
    repeat: repeat === 'once' || repeat === 'one' ? repeat : 'off',
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
  const [prefs, setPrefs] = useState<PlayerPrefs>(loadPrefs)
  // True saat lagu sedang di putaran ulang ke-2 (mode `once`).
  const [repeatingOnce, setRepeatingOnce] = useState(false)
  const prefsRef = useRef(prefs)
  // Sudah mengulang 1x untuk lagu ini? Direset setiap lagu baru dimulai.
  const replayedRef = useRef(false)

  // Lagu playlist aktif. Hanya dipakai untuk membentuk queue saat pengguna memilih lagu;
  // queue yang sedang berjalan disimpan di `state.queue` (+ `state.currentIndex`).
  const playlistTracksRef = useRef(playlistTracks)
  useEffect(() => {
    playlistTracksRef.current = playlistTracks
  }, [playlistTracks])
  // Diisi setelah `playAt` didefinisikan; dipakai handler event `ended` untuk auto-next.
  const playAtRef = useRef<(index: number) => void>(() => {})
  // Memutar ulang lagu aktif tanpa meminta URL baru (tanpa jeda); dipakai mode ulang.
  const replayCurrentRef = useRef<() => void>(() => {})
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
          const { queue, currentIndex, shuffleOrder } = stateRef.current
          const { repeat } = prefsRef.current
          // Ulang lagu yang sama: terus-menerus (`one`) atau tepat 1x (`once`), lalu lanjut.
          if (currentIndex !== null && (repeat === 'one' || (repeat === 'once' && !replayedRef.current))) {
            if (repeat === 'once') {
              replayedRef.current = true
              setRepeatingOnce(true)
            }
            replayCurrentRef.current()
            break
          }
          // Lanjut otomatis ke lagu berikutnya (urutan acak jika aktif); di lagu terakhir berhenti `ended`.
          const next = getNextIndex(queue, currentIndex, shuffleOrder)
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
    (queue: readonly PlaylistTrack[], index: number, options: StartOptions = {}) => {
      const track = queue[index]
      if (!track) return
      if (!options.keepReplay) {
        replayedRef.current = false
        setRepeatingOnce(false)
      }
      // Acak aktif: urutan dibuat ulang dari lagu ini, kecuali pemanggil meminta urutan lama dipertahankan
      // (lanjut/mundur/lompat di antrean) dan urutan itu masih cocok dengan queue.
      let shuffleOrder: readonly number[] | null = null
      if (prefsRef.current.shuffle) {
        const previous = stateRef.current
        shuffleOrder =
          options.keepOrder && previous.queue === queue && isOrderUsable(previous.shuffleOrder, queue.length, index)
            ? previous.shuffleOrder
            : createShuffleOrder(queue.length, index)
      }
      // Harus sinkron di dalam gestur klik (lihat AudioEngine.prime). Juga menghentikan lagu lama.
      audioEngine.prime()
      clearStartTimer()
      controllerRef.current?.abort()

      const controller = new AbortController()
      controllerRef.current = controller
      const requestId = ++requestIdRef.current
      const isStale = () => requestIdRef.current !== requestId

      commit({
        status: 'resolving',
        currentTrack: track,
        queue,
        currentIndex: index,
        shuffleOrder,
        playbackInfo: null,
        error: null,
      })
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
        if (currentIndex !== null) startPlayback(queue, currentIndex, { keepOrder: true })
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
      startPlayback(queue, currentIndex, { keepOrder: true })
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
      startPlayback(stateRef.current.queue, index, { keepOrder: true })
    },
    [startPlayback],
  )
  useEffect(() => {
    playAtRef.current = playAt
  }, [playAt])

  const playNext = useCallback(() => {
    const { queue, currentIndex, shuffleOrder } = stateRef.current
    const next = getNextIndex(queue, currentIndex, shuffleOrder)
    if (next !== null) playAt(next)
  }, [playAt])

  const playQueueItem = useCallback(
    (index: number) => {
      if (isValidIndex(stateRef.current.queue, index)) playAt(index)
    },
    [playAt],
  )

  /** Menyimpan hasil pengubahan antrean; lagu yang sedang diputar tidak disentuh. */
  const applyQueueEdit = useCallback(
    (edit: QueueEdit | null) => {
      if (edit) commit({ queue: edit.queue, currentIndex: edit.currentIndex, shuffleOrder: edit.shuffleOrder })
    },
    [commit],
  )

  const moveUpcoming = useCallback(
    (from: number, to: number) => {
      const { queue, currentIndex, shuffleOrder } = stateRef.current
      applyQueueEdit(moveUpcomingTrack(queue, currentIndex, shuffleOrder, from, to))
    },
    [applyQueueEdit],
  )

  const removeUpcoming = useCallback(
    (position: number) => {
      const { queue, currentIndex, shuffleOrder } = stateRef.current
      applyQueueEdit(removeUpcomingTrack(queue, currentIndex, shuffleOrder, position))
    },
    [applyQueueEdit],
  )

  /**
   * Menambah lagu ke antrean. Tidak ada lagu aktif (antrean kosong): lagu itu langsung diputar dan
   * menjadi awal antrean. Jika antrean ada tetapi sudah selesai/error, lagu tetap masuk "Berikutnya".
   */
  const enqueue = useCallback(
    (track: PlaylistTrack, where: 'next' | 'end'): QueueAddResult => {
      const { queue, currentIndex, shuffleOrder, currentTrack } = stateRef.current
      if (!isValidIndex(queue, currentIndex) || !currentTrack) {
        startPlayback([track], 0)
        return 'started'
      }
      if (queue[currentIndex].id === track.id) return 'current'
      const before = queue.length
      const edit = insertUpcomingTrack(queue, currentIndex, shuffleOrder, track, where)
      if (!edit) return 'duplicate'
      applyQueueEdit(edit)
      return edit.queue.length > before ? 'added' : 'moved'
    },
    [applyQueueEdit, startPlayback],
  )
  const addToQueue = useCallback((track: PlaylistTrack) => enqueue(track, 'end'), [enqueue])
  const playNextInQueue = useCallback((track: PlaylistTrack) => enqueue(track, 'next'), [enqueue])

  const playPrevious = useCallback(() => {
    const { queue, currentIndex, status, shuffleOrder } = stateRef.current
    const { currentTime, seekable } = timeRef.current
    const inTrack = SEEKABLE_STATUSES.includes(status)
    const previous = getPreviousIndex(queue, currentIndex, shuffleOrder)
    if (inTrack && currentTime > RESTART_THRESHOLD_S) {
      // Lagu sudah berjalan > 3 detik: ulang lagu ini. Bila audio tidak bisa di-seek,
      // muat ulang dari awal (URL baru) agar hasilnya tetap sama.
      if (seekable) seekTo(0)
      else if (currentIndex !== null) startPlayback(queue, currentIndex, { keepOrder: true })
    } else if (previous !== null) {
      playAt(previous)
    } else if (inTrack && seekable) {
      seekTo(0)
    }
  }, [playAt, seekTo, startPlayback])

  /** Mengulang lagu aktif dari 0:00. Memakai audio yang sudah dimuat; gagal = minta URL baru. */
  const replayCurrent = useCallback(() => {
    const { queue, currentIndex } = stateRef.current
    if (currentIndex === null) return
    const requestId = requestIdRef.current
    audioEngine.resume().catch(() => {
      if (requestIdRef.current !== requestId) return
      startPlayback(queue, currentIndex, { keepOrder: true, keepReplay: true })
    })
  }, [startPlayback])
  useEffect(() => {
    replayCurrentRef.current = replayCurrent
  }, [replayCurrent])

  const updatePrefs = useCallback((patch: Partial<PlayerPrefs>) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefs(next)
    writeJson(PREFS_KEY, next) // gagal menyimpan (storage terblokir) tidak mengubah perilaku sesi ini
  }, [])

  const toggleShuffle = useCallback(() => {
    const enabled = !prefsRef.current.shuffle
    updatePrefs({ shuffle: enabled })
    const { queue, currentIndex } = stateRef.current
    // Lagu aktif tidak terganggu: hanya urutan setelahnya yang dibuat/dibuang.
    commit({
      shuffleOrder: enabled && isValidIndex(queue, currentIndex) ? createShuffleOrder(queue.length, currentIndex) : null,
    })
  }, [commit, updatePrefs])

  const cycleRepeat = useCallback(() => {
    const next = REPEAT_CYCLE[prefsRef.current.repeat]
    updatePrefs({ repeat: next })
    if (next !== 'once') {
      replayedRef.current = false
      setRepeatingOnce(false)
    }
  }, [updatePrefs])

  const actions = useMemo<AudioPlayerActions>(
    () => ({
      playTrack,
      selectTrack,
      playAll,
      playQueueItem,
      moveUpcoming,
      removeUpcoming,
      addToQueue,
      playNextInQueue,
      togglePlayPause,
      playNext,
      playPrevious,
      toggleShuffle,
      cycleRepeat,
      seekTo,
      retry,
      cleanup,
    }),
    [
      playTrack,
      selectTrack,
      playAll,
      playQueueItem,
      moveUpcoming,
      removeUpcoming,
      addToQueue,
      playNextInQueue,
      togglePlayPause,
      playNext,
      playPrevious,
      toggleShuffle,
      cycleRepeat,
      seekTo,
      retry,
      cleanup,
    ],
  )

  const { queue, currentIndex, shuffleOrder } = state
  const { shuffle, repeat } = prefs
  const queueState = useMemo<PlayerQueueState>(
    () => ({
      hasPrevious: hasPrevious(queue, currentIndex, shuffleOrder),
      hasNext: hasNext(queue, currentIndex, shuffleOrder),
      shuffle,
      repeat,
      repeatingOnce: repeat === 'once' && repeatingOnce,
    }),
    [queue, currentIndex, shuffleOrder, shuffle, repeat, repeatingOnce],
  )

  return { state, time, queueState, actions }
}
