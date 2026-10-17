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
  QueueAddOptions,
  QueueAddResult,
  RepeatMode,
} from '../types/player'
import type { PlayAllHandler, PlaybackInfo, PlaylistTrack, PlayTrackHandler } from '../types/spotify'
import { clearPlayerSession, loadPlayerSession, savePlayerPosition, savePlayerQueue } from '../utils/playerSession'
import { isLikelyClip } from '../utils/clipDetect'
import { readJson, writeJson } from '../utils/safeStorage'
import {
  createShuffleOrder,
  getNextIndex,
  getPreviousIndex,
  canRestartQueue,
  hasNext,
  hasPrevious,
  insertUpcomingTrack,
  isOrderUsable,
  isValidIndex,
  moveUpcomingTrack,
  NO_TRACKS,
  pickRestartIndex,
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
  /** Setelah audio termuat, loncat ke detik ini (lanjut dari sesi tersimpan). */
  resumeAt?: number
}

/** Lagu berikutnya yang sedang/sudah dimuat di elemen cadangan untuk crossfade. */
interface Preload {
  trackId: string
  index: number
  status: 'resolving' | 'ready' | 'failed'
  info: PlaybackInfo | null
  controller: AbortController
  /** Berapa kali pengambilan URL sudah dicoba (gagal sesaat tidak boleh membatalkan crossfade). */
  attempts: number
  /** Waktu (ms epoch) paling awal untuk mencoba lagi setelah gagal. */
  retryAt: number
}

const PRELOAD_MAX_ATTEMPTS = 3
const PRELOAD_RETRY_DELAY_MS = 2_500

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
    case 'clip_only':
      return 'Server hanya menyediakan cuplikan (±30 detik) untuk lagu ini, bukan audio penuh. Coba lagi nanti.'
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

/** Pilihan lama crossfade (detik) yang diterima dari penyimpanan / UI. */
export const CROSSFADE_OPTIONS_S = [0, 3, 5, 8, 12] as const
const DEFAULT_CROSSFADE_S = 5
/**
 * Lagu berikutnya mulai dimuat sebanyak ini (detik) SEBELUM crossfade dimulai, supaya URL sempat diambil
 * dan audionya ter-buffer. Tanpa ini crossfade harus menunggu jaringan dan muncul jeda.
 */
const PRELOAD_LEAD_S = 30
/** Sleep timer "akhir lagu": volume mulai mengecil pada sekian detik terakhir lagu. */
const TRACK_END_FADE_S = 8

const PREFS_KEY = 'musicverse.player.prefs.v1'
const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = { off: 'once', once: 'one', one: 'off' }

interface PlayerPrefs {
  shuffle: boolean
  repeat: RepeatMode
  crossfadeSeconds: number
}

/** Preferensi acak/ulang disimpan di perangkat; data rusak atau storage terblokir = default. */
function loadPrefs(): PlayerPrefs {
  const result = readJson(PREFS_KEY)
  if (result.status !== 'ok' || typeof result.value !== 'object' || result.value === null) {
    return { shuffle: false, repeat: 'off', crossfadeSeconds: DEFAULT_CROSSFADE_S }
  }
  const { shuffle, repeat, crossfadeSeconds } = result.value as Record<string, unknown>
  return {
    shuffle: shuffle === true,
    repeat: repeat === 'once' || repeat === 'one' ? repeat : 'off',
    // Data lama (tanpa kolom ini) atau nilai asing = default.
    crossfadeSeconds: (CROSSFADE_OPTIONS_S as readonly unknown[]).includes(crossfadeSeconds)
      ? (crossfadeSeconds as number)
      : DEFAULT_CROSSFADE_S,
  }
}

/** Simpan posisi paling sering sekali per interval ini saat lagu berjalan. */
const POSITION_SAVE_INTERVAL_MS = 5_000
/** Posisi tersimpan yang terlalu dekat dengan akhir lagu diabaikan: lagu mulai dari awal. */
const RESUME_END_MARGIN_S = 3

/** "3:45" / "1:02:10" -> detik; null jika formatnya tidak dikenali. */
function parseDurationText(text: string): number | null {
  if (!/^\d{1,3}(:\d{1,2}){1,2}$/.test(text.trim())) return null
  return text
    .trim()
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0)
}

interface BootSession {
  state: AudioPlayerState
  time: PlaybackTime
}

/**
 * Memulihkan sesi terakhir (antrean, lagu aktif, posisi) sebagai keadaan "dijeda": tidak ada audio yang
 * dimuat dan tidak ada suara sampai pengguna menekan Play. Play lalu meminta URL baru (tautan lama
 * sudah kedaluwarsa) dan lanjut dari posisi tersimpan.
 */
function buildBootSession(): BootSession | null {
  const saved = loadPlayerSession()
  if (!saved) return null
  const track = saved.queue[saved.index]
  const prefs = loadPrefs()
  const shuffleOrder = prefs.shuffle
    ? isOrderUsable(saved.shuffleOrder, saved.queue.length, saved.index)
      ? saved.shuffleOrder
      : createShuffleOrder(saved.queue.length, saved.index)
    : null
  return {
    state: {
      ...initialState,
      status: 'paused',
      currentTrack: track,
      queue: saved.queue,
      currentIndex: saved.index,
      shuffleOrder,
    },
    time: { currentTime: saved.position, duration: parseDurationText(track.duration), seekable: false },
  }
}

const ACTIVE_STATUSES: PlaybackStatus[] = ['playing', 'buffering', 'loading']

/**
 * Logika playback. Dipanggil SEKALI oleh AudioPlayerProvider; komponen memakai
 * `useAudioPlayer()` agar semuanya berbagi satu state dan satu audio engine.
 */
export function useAudioPlayerController(playlistTracks: PlaylistTrack[]) {
  const [boot] = useState(buildBootSession)
  const [state, setState] = useState<AudioPlayerState>(boot?.state ?? initialState)
  const [time, setTime] = useState<PlaybackTime>(boot?.time ?? initialTime)
  const [prefs, setPrefs] = useState<PlayerPrefs>(loadPrefs)
  // True saat lagu sedang di putaran ulang ke-2 (mode `once`).
  const [repeatingOnce, setRepeatingOnce] = useState(false)
  const prefsRef = useRef(prefs)
  // Sleep timer "akhir lagu": ref dibaca handler `ended`, state hanya untuk tampilan.
  const [stopAfterTrack, setStopAfterTrackState] = useState(false)
  const stopAfterTrackRef = useRef(false)
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
  // Antrean habis: putar ulang antrean yang sama secara acak. Diisi setelah `updatePrefs` didefinisikan.
  const restartQueueRef = useRef<() => void>(() => {})
  // Memutar ulang lagu aktif tanpa meminta URL baru (tanpa jeda); dipakai mode ulang.
  const replayCurrentRef = useRef<() => void>(() => {})
  // Dipanggil tiap `timeupdate`: memuat lagu berikutnya lebih awal, memulai crossfade, dan meredam volume akhir lagu.
  const crossfadeStepRef = useRef<(event: AudioEngineEvent) => void>(() => {})
  const timeRef = useRef<PlaybackTime>(boot?.time ?? initialTime)
  const updateTime = useCallback((next: (prev: PlaybackTime) => PlaybackTime) => {
    const value = next(timeRef.current)
    if (value === timeRef.current) return
    timeRef.current = value
    setTime(value)
  }, [])

  // stateRef adalah sumber kebenaran untuk aksi/event; setState hanya memicu render.
  const stateRef = useRef<AudioPlayerState>(boot?.state ?? initialState)
  // True selama keadaan berasal dari sesi tersimpan dan belum ada audio yang dimuat (Play = mulai dari URL baru).
  const restoredRef = useRef(boot !== null)
  // Detik tujuan setelah audio termuat (lanjut dari posisi tersimpan); null = mulai dari awal.
  const resumeAtRef = useRef<number | null>(null)
  /** Dipanggil saat durasi audio yang sebenarnya diketahui; mendeteksi klip 30 detik lalu ganti sumber. */
  const clipGuardRef = useRef<((duration: number) => void) | null>(null)
  /** Id lagu berikutnya yang crossfade-nya sudah gagal (play() ditolak): jangan dicoba berulang tiap timeupdate. */
  const crossfadeGaveUpRef = useRef<string | null>(null)
  const lastPositionSaveRef = useRef(0)
  // Diisi setelah `persistPosition` didefinisikan; dipanggil dari handler event audio.
  const persistPositionRef = useRef<(force: boolean, position?: number) => void>(() => {})
  const requestIdRef = useRef(0)
  const preloadRef = useRef<Preload | null>(null)
  // True dari saat crossfade diputuskan sampai engine selesai berpindah; mencegah pemicu ganda.
  const crossfadingRef = useRef(false)
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

  /** Membatalkan permintaan URL lagu berikutnya dan melepas audio yang sudah dimuat untuk crossfade. */
  const discardPreload = useCallback(() => {
    preloadRef.current?.controller.abort()
    preloadRef.current = null
    crossfadingRef.current = false
    audioEngine.clearPreload()
  }, [])

  /** Event dari HTMLAudioElement: satu-satunya jalan menuju status playing/paused/buffering/ended. */
  const handleEngineEvent = useCallback(
    (event: AudioEngineEvent) => {
      const { status } = stateRef.current
      // Lanjut dari posisi tersimpan: coba loncat begitu audio bisa di-seek; menyerah saat sudah `playing`.
      const resumeAt = resumeAtRef.current
      if (
        resumeAt !== null &&
        (event.type === 'loadedmetadata' || event.type === 'durationchange' || event.type === 'progress' || event.type === 'playing')
      ) {
        if (event.duration !== null && resumeAt >= event.duration - RESUME_END_MARGIN_S) {
          resumeAtRef.current = null
        } else {
          const applied = audioEngine.seek(resumeAt)
          if (applied !== null) {
            resumeAtRef.current = null
            updateTime((prev) => ({ ...prev, currentTime: applied }))
          } else if (event.type === 'playing') {
            resumeAtRef.current = null
          }
        }
      }
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
          persistPositionRef.current(true, event.currentTime)
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
          if (
            (event.type === 'loadedmetadata' || event.type === 'durationchange') &&
            event.duration !== null &&
            (status === 'loading' || status === 'playing' || status === 'buffering')
          ) {
            clipGuardRef.current?.(event.duration)
          }
          if (event.type === 'timeupdate') {
            crossfadeStepRef.current(event)
            persistPositionRef.current(false, event.currentTime)
          }
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
          // Lagu selesai: sesi berikutnya mulai dari awal lagu ini (bukan dari detik terakhir).
          if (stateRef.current.currentTrack) {
            lastPositionSaveRef.current = Date.now()
            savePlayerPosition(stateRef.current.currentTrack.id, 0)
          }
          // Sleep timer "akhir lagu": berhenti di sini, apa pun mode ulang/antreannya.
          if (stopAfterTrackRef.current) {
            stopAfterTrackRef.current = false
            setStopAfterTrackState(false)
            setStatus('ended')
            updateTime((prev) => ({
              currentTime: event.duration ?? prev.currentTime,
              duration: event.duration ?? prev.duration,
              seekable: event.seekable,
            }))
            break
          }
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
          // Antrean habis: putar ulang antrean YANG SAMA secara acak (tidak menarik lagu dari playlist lain).
          // Antrean berisi satu lagu tidak diulang otomatis; berhenti `ended` seperti biasa.
          if (canRestartQueue(queue.length)) {
            restartQueueRef.current()
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
      preloadRef.current?.controller.abort()
      preloadRef.current = null
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
      restoredRef.current = false
      resumeAtRef.current = options.resumeAt !== undefined && options.resumeAt > 0 ? options.resumeAt : null
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
      // Harus sinkron di dalam gestur klik (lihat AudioEngine.prime). Juga menghentikan lagu lama
      // dan membuang lagu yang sudah dimuat untuk crossfade (daftar berikutnya bisa saja berubah).
      discardPreload()
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
      updateTime(() => (resumeAtRef.current === null ? initialTime : { ...initialTime, currentTime: resumeAtRef.current }))

      clipGuardRef.current = null
      crossfadeGaveUpRef.current = null
      const expectedDuration = parseDurationText(track.duration)
      // API yang terbukti memberi klip ~30 detik untuk lagu ini; dilewati pada percobaan berikutnya.
      const avoid: Array<'kyzz' | 'cadangan'> = []

      const attempt = async (): Promise<void> => {
        // Setiap permintaan play selalu mengambil URL audio terbaru (tanpa cache).
        let info: PlaybackInfo
        try {
          info = await fetchPlaybackInfo(track, { signal: controller.signal, avoid })
        } catch (error) {
          if (isStale()) return
          if (error instanceof SpotifyApiError) {
            if (error.code === 'aborted') return
            if (error.code === 'clip_only' || avoid.length > 0) {
              // Sumber yang tersisa gagal setelah klip ditolak: jangan memutar klip, beri tahu pengguna.
              fail('clip_only')
            } else {
              fail(error.code === 'no_audio' ? 'no_audio' : 'resolve_failed', error.message)
            }
          } else {
            fail(avoid.length > 0 ? 'clip_only' : 'resolve_failed')
          }
          return
        }
        if (isStale()) return

        // Durasi file audio yang sebenarnya baru diketahui setelah metadata dimuat. Jika hanya klip
        // (≤35 dtk untuk lagu yang jauh lebih panjang), buang dan coba API lain.
        clipGuardRef.current = (duration) => {
          if (isStale() || !isLikelyClip(duration, expectedDuration)) return
          clipGuardRef.current = null
          console.warn(
            `[MusicVerse] Audio dari ${info.apiSource ?? 'sumber tak dikenal'} hanya ${duration.toFixed(1)} dtk ` +
              `(seharusnya ~${expectedDuration} dtk): dianggap cuplikan, mencoba sumber lain.`,
          )
          clearStartTimer()
          if (!info.apiSource || avoid.includes(info.apiSource)) {
            fail('clip_only')
            return
          }
          avoid.push(info.apiSource)
          commit({ status: 'resolving', playbackInfo: null, error: null })
          audioEngine.stop()
          void attempt()
        }

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
      }

      void attempt()
    },
    [clearStartTimer, commit, discardPreload, fail, updateTime],
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

  /** Antrean baru dari daftar yang diberikan, mulai dari `index`. */
  const playList = useCallback(
    (tracks: readonly PlaylistTrack[], index: number) => {
      if (isValidIndex(tracks, index)) startPlayback(tracks, index)
    },
    [startPlayback],
  )

  const pause = useCallback(() => {
    if (ACTIVE_STATUSES.includes(stateRef.current.status)) audioEngine.pause() // status berubah lewat event `pause`
  }, [])

  const setStopAfterTrack = useCallback((enabled: boolean) => {
    stopAfterTrackRef.current = enabled
    setStopAfterTrackState(enabled)
    if (!enabled) audioEngine.setTrackEndGain(1)
  }, [])

  const togglePlayPause = useCallback(() => {
    const { status, queue, currentIndex } = stateRef.current
    switch (status) {
      case 'playing':
      case 'buffering':
      case 'loading':
        audioEngine.pause() // status berubah lewat event `pause`
        break
      case 'paused': {
        // Sesi dipulihkan dari penyimpanan: belum ada audio, mulai dari URL baru lalu lompat ke posisi tersimpan.
        if (restoredRef.current && currentIndex !== null) {
          startPlayback(queue, currentIndex, { keepOrder: true, resumeAt: timeRef.current.currentTime })
          break
        }
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
    discardPreload()
    audioEngine.stop()
    restoredRef.current = false
    resumeAtRef.current = null
    stopAfterTrackRef.current = false
    setStopAfterTrackState(false)
    if (stateRef.current !== initialState) {
      stateRef.current = initialState
      setState(initialState)
    }
    updateTime(() => initialTime)
  }, [clearStartTimer, discardPreload, updateTime])

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
    (track: PlaylistTrack, where: 'next' | 'end', options?: QueueAddOptions): QueueAddResult => {
      const { queue, currentIndex, shuffleOrder, currentTrack } = stateRef.current
      if (!isValidIndex(queue, currentIndex) || !currentTrack) {
        startPlayback([track], 0)
        return 'started'
      }
      if (queue[currentIndex].id === track.id) return 'current'
      // Antrean tidak dicampur: lagu yang belum ada di antrean ini hanya boleh masuk dari hasil pencarian.
      if (!options?.fromSearch && !queue.some((item) => item.id === track.id)) return 'blocked'
      const before = queue.length
      const edit = insertUpcomingTrack(queue, currentIndex, shuffleOrder, track, where)
      if (!edit) return 'duplicate'
      applyQueueEdit(edit)
      return edit.queue.length > before ? 'added' : 'moved'
    },
    [applyQueueEdit, startPlayback],
  )
  const addToQueue = useCallback(
    (track: PlaylistTrack, options?: QueueAddOptions) => enqueue(track, 'end', options),
    [enqueue],
  )
  const playNextInQueue = useCallback(
    (track: PlaylistTrack, options?: QueueAddOptions) => enqueue(track, 'next', options),
    [enqueue],
  )

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

  /**
   * Crossfade: (1) menjelang akhir lagu, minta URL lagu berikutnya dan muat di elemen cadangan;
   * (2) pada `fade` detik terakhir, mulai memutarnya dengan volume naik sambil lagu ini memudar,
   * lalu pindahkan state ke lagu baru. Bila ada yang tidak siap (jaringan lambat, play() ditolak),
   * tidak ada yang diubah dan alur normal (`ended` → lagu berikutnya) tetap jalan.
   */
  const crossfadeStep = useCallback(
    (event: AudioEngineEvent) => {
      const { status, queue, currentIndex, shuffleOrder } = stateRef.current
      if (status !== 'playing' || currentIndex === null || crossfadingRef.current) return
      const duration = event.duration
      if (duration === null || duration <= 0) return
      const remaining = duration - event.currentTime

      // Sleep timer "akhir lagu": volume mengecil di detik-detik terakhir, tanpa crossfade.
      if (stopAfterTrackRef.current) {
        audioEngine.setTrackEndGain(remaining >= TRACK_END_FADE_S ? 1 : Math.max(0, remaining / TRACK_END_FADE_S) ** 2)
        return
      }

      const fadeSetting = prefsRef.current.crossfadeSeconds
      if (fadeSetting <= 0 || !audioEngine.supportsVolumeFade()) return
      const { repeat } = prefsRef.current
      // Lagu yang akan diulang tidak bertukar dengan lagu lain.
      if (repeat === 'one' || (repeat === 'once' && !replayedRef.current)) return
      // Lagu pendek: jangan sampai fade memakan lebih dari sepertiganya.
      const fade = Math.min(fadeSetting, duration / 3)
      if (remaining > fade + PRELOAD_LEAD_S || remaining <= 0.2) return

      const nextIndex = getNextIndex(queue, currentIndex, shuffleOrder)
      const nextTrack = nextIndex === null ? null : queue[nextIndex]
      if (nextIndex === null || !nextTrack) return // antrean habis: alur normal (berhenti / putar ulang)
      if (crossfadeGaveUpRef.current === nextTrack.id) return

      let preload = preloadRef.current
      // Daftar "Berikutnya" berubah sejak dimuat: buang dan muat yang baru.
      if (preload && (preload.trackId !== nextTrack.id || preload.index !== nextIndex)) {
        discardPreload()
        preload = null
      }
      const startFetch = (entry: Preload) => {
        entry.attempts += 1
        entry.status = 'resolving'
        void (async () => {
          try {
            const info = await fetchPlaybackInfo(nextTrack, { signal: entry.controller.signal })
            if (preloadRef.current !== entry) return
            if (!audioEngine.preload(info.audioUrl)) {
              preloadRef.current = null // belum bisa dipakai; dicoba lagi pada timeupdate berikutnya
              return
            }
            entry.info = info
            entry.status = 'ready'
          } catch (error) {
            if (preloadRef.current !== entry) return
            if (error instanceof SpotifyApiError && error.code === 'aborted') return
            // Gagal sesaat (rate limit / timeout) cukup sering terjadi: coba lagi beberapa kali selama
            // masih ada waktu, baru menyerah ke alur normal (lagu berikutnya mulai saat lagu ini selesai).
            console.warn(`[MusicVerse] Preload crossfade gagal (percobaan ${entry.attempts}/${PRELOAD_MAX_ATTEMPTS}):`, error)
            entry.status = 'failed'
            entry.retryAt = Date.now() + PRELOAD_RETRY_DELAY_MS
          }
        })()
      }
      if (!preload) {
        if (audioEngine.isCrossfading()) return
        const controller = new AbortController()
        const entry: Preload = {
          trackId: nextTrack.id,
          index: nextIndex,
          status: 'resolving',
          info: null,
          controller,
          attempts: 0,
          retryAt: 0,
        }
        preloadRef.current = entry
        startFetch(entry)
        return
      }
      if (preload.status === 'failed') {
        if (preload.attempts < PRELOAD_MAX_ATTEMPTS && Date.now() >= preload.retryAt && remaining > 1) startFetch(preload)
        return
      }
      if (preload.status !== 'ready' || !preload.info || remaining > fade) return
      // Saat waktunya tiba, mulai crossfade walau lagu cadangan belum ter-buffer penuh: browser mobile sering
      // mengabaikan preload="auto", sehingga syarat "siap penuh" tidak pernah terpenuhi dan crossfade batal.
      if (!audioEngine.isPreloadReady(preload.info.audioUrl, true)) return
      // Lagu berikutnya ternyata hanya klip ~30 detik: jangan di-crossfade. Entri dibiarkan 'resolving'
      // (tidak dicoba lagi tiap timeupdate); saat lagu ini selesai, startPlayback mengambil sumber yang benar.
      // Durasi file belum diketahui (metadata belum termuat): jangan crossfade dulu, karena klip ~30 detik tidak
      // bisa dikenali dan akan ikut diputar tanpa pengaman. Dicoba lagi di timeupdate berikutnya; jika tetap
      // tidak diketahui, lagu berikutnya dimulai lewat startPlayback yang punya pengaman klip.
      const expectedNext = parseDurationText(nextTrack.duration)
      const loadedNext = audioEngine.preloadDuration(preload.info.audioUrl)
      if (expectedNext !== null && loadedNext === null) return
      if (isLikelyClip(loadedNext, expectedNext)) {
        preload.status = 'resolving'
        preload.info = null
        audioEngine.clearPreload()
        return
      }

      crossfadingRef.current = true
      const info = preload.info
      const requestId = requestIdRef.current
      void audioEngine.crossfadeToStandby(fade * 1000).then((switched) => {
        crossfadingRef.current = false
        if (requestIdRef.current !== requestId || preloadRef.current !== preload) return
        preloadRef.current = null
        if (!switched) {
          // play() ditolak: lagu lama jalan terus, alur normal saat selesai (tanpa mencoba ulang tiap timeupdate).
          crossfadeGaveUpRef.current = nextTrack.id
          return
        }
        crossfadeGaveUpRef.current = null
        // Lagu baru sudah terdengar: sinkronkan state (urutan acak dipertahankan, antrean sama).
        replayedRef.current = false
        setRepeatingOnce(false)
        requestIdRef.current++
        commit({ currentTrack: nextTrack, currentIndex: nextIndex, playbackInfo: info, error: null })
      })
    },
    [commit, discardPreload],
  )
  useEffect(() => {
    crossfadeStepRef.current = crossfadeStep
  }, [crossfadeStep])

  const fadeOutAndPause = useCallback((durationMs: number) => {
    if (ACTIVE_STATUSES.includes(stateRef.current.status)) audioEngine.fadeOutAndPause(durationMs)
  }, [])

  const cancelFade = useCallback(() => {
    audioEngine.cancelFade()
  }, [])

  const updatePrefs = useCallback((patch: Partial<PlayerPrefs>) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefs(next)
    writeJson(PREFS_KEY, next) // gagal menyimpan (storage terblokir) tidak mengubah perilaku sesi ini
  }, [])

  const setCrossfade = useCallback(
    (seconds: number) => {
      updatePrefs({ crossfadeSeconds: (CROSSFADE_OPTIONS_S as readonly number[]).includes(seconds) ? seconds : 0 })
      if (seconds <= 0) discardPreload()
    },
    [discardPreload, updatePrefs],
  )

  const toggleShuffle = useCallback(() => {
    const enabled = !prefsRef.current.shuffle
    updatePrefs({ shuffle: enabled })
    const { queue, currentIndex } = stateRef.current
    // Lagu aktif tidak terganggu: hanya urutan setelahnya yang dibuat/dibuang.
    commit({
      shuffleOrder: enabled && isValidIndex(queue, currentIndex) ? createShuffleOrder(queue.length, currentIndex) : null,
    })
  }, [commit, updatePrefs])

  /**
   * Antrean sudah habis: mulai lagi dari antrean yang sama dengan urutan acak baru. Isi antrean tidak
   * berubah (tidak ada lagu dari playlist lain yang masuk). Mode acak dinyalakan agar tombolnya
   * sesuai dengan yang sedang terjadi.
   */
  const restartQueue = useCallback(() => {
    const { queue, currentIndex } = stateRef.current
    if (!canRestartQueue(queue.length)) return
    if (!prefsRef.current.shuffle) updatePrefs({ shuffle: true })
    // Acak aktif dan keepOrder tidak diberikan, jadi startPlayback membuat urutan acak baru dari lagu ini.
    startPlayback(queue, pickRestartIndex(queue.length, currentIndex))
  }, [startPlayback, updatePrefs])
  useEffect(() => {
    restartQueueRef.current = restartQueue
  }, [restartQueue])

  const cycleRepeat = useCallback(() => {
    const next = REPEAT_CYCLE[prefsRef.current.repeat]
    updatePrefs({ repeat: next })
    if (next !== 'once') {
      replayedRef.current = false
      setRepeatingOnce(false)
    }
  }, [updatePrefs])

  /** Menyimpan posisi lagu aktif. `force` mengabaikan pembatas interval (jeda, app ke background). */
  const persistPosition = useCallback((force: boolean, position?: number) => {
    const { currentTrack, status } = stateRef.current
    if (!currentTrack) return
    // Selama menunggu loncat ke posisi tersimpan, waktu masih 0: jangan menimpa posisi yang benar.
    if (resumeAtRef.current !== null) return
    const now = Date.now()
    if (!force && now - lastPositionSaveRef.current < POSITION_SAVE_INTERVAL_MS) return
    lastPositionSaveRef.current = now
    savePlayerPosition(currentTrack.id, status === 'ended' ? 0 : (position ?? timeRef.current.currentTime))
  }, [])
  useEffect(() => {
    persistPositionRef.current = persistPosition
  }, [persistPosition])

  // Antrean / lagu aktif / urutan acak berubah: simpan (dan posisi ikut ke 0:00 untuk lagu baru).
  const { currentTrack: savedTrack, queue: savedQueue, currentIndex: savedIndex, shuffleOrder: savedOrder } = state
  useEffect(() => {
    if (!savedTrack || savedIndex === null) {
      clearPlayerSession()
      return
    }
    savePlayerQueue(savedQueue, savedIndex, savedOrder)
    // Sesi yang baru dipulihkan memakai posisi tersimpan; selain itu lagu baru mulai dari awal.
    persistPosition(true, restoredRef.current ? timeRef.current.currentTime : 0)
  }, [savedTrack, savedQueue, savedIndex, savedOrder, persistPosition])

  // App ke background / ditutup: simpan posisi terakhir.
  useEffect(() => {
    const flush = () => persistPositionRef.current(true)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const actions = useMemo<AudioPlayerActions>(
    () => ({
      playTrack,
      selectTrack,
      playAll,
      playList,
      playQueueItem,
      moveUpcoming,
      removeUpcoming,
      addToQueue,
      playNextInQueue,
      togglePlayPause,
      pause,
      setStopAfterTrack,
      fadeOutAndPause,
      cancelFade,
      setCrossfade,
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
      playList,
      playQueueItem,
      moveUpcoming,
      removeUpcoming,
      addToQueue,
      playNextInQueue,
      togglePlayPause,
      pause,
      setStopAfterTrack,
      fadeOutAndPause,
      cancelFade,
      setCrossfade,
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
  const { shuffle, repeat, crossfadeSeconds } = prefs
  const crossfadeSupported = audioEngine.supportsVolumeFade()
  const queueState = useMemo<PlayerQueueState>(
    () => ({
      hasPrevious: hasPrevious(queue, currentIndex, shuffleOrder),
      hasNext: hasNext(queue, currentIndex, shuffleOrder),
      shuffle,
      repeat,
      repeatingOnce: repeat === 'once' && repeatingOnce,
      stopAfterTrack,
      crossfadeSeconds,
      crossfadeSupported,
    }),
    [queue, currentIndex, shuffleOrder, shuffle, repeat, repeatingOnce, stopAfterTrack, crossfadeSeconds, crossfadeSupported],
  )

  return { state, time, queueState, actions }
}
