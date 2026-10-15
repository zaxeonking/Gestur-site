import type { PlaybackInfo, PlayAllHandler, PlaylistTrack, PlayTrackHandler } from './spotify'

/**
 * Status playback. `playing` HANYA diisi setelah event `playing` dari
 * HTMLAudioElement diterima; respons API atau panggilan play() tidak cukup.
 *
 * idle       belum ada lagu
 * resolving  menunggu endpoint /api/spotifyplay
 * loading    audio dimuat / play() diminta, belum ada event `playing`
 * playing    audio benar-benar berjalan
 * buffering  sempat berjalan lalu menunggu data (event `waiting`)
 * paused     dijeda (event `pause`)
 * ended      selesai (event `ended`)
 * error      gagal di tahap mana pun
 */
export type PlaybackStatus =
  | 'idle'
  | 'resolving'
  | 'loading'
  | 'playing'
  | 'buffering'
  | 'paused'
  | 'ended'
  | 'error'

export type PlayerErrorCode =
  | 'resolve_failed'
  | 'no_audio'
  | 'blocked'
  | 'network'
  | 'unsupported'
  | 'decode'
  | 'timeout'
  | 'unknown'

/**
 * Mode ulang.
 * off   lagu berjalan normal ke lagu berikutnya
 * once  setiap lagu diulang 1x, baru lanjut ke lagu berikutnya
 * one   lagu yang sama diulang terus-menerus sampai dimatikan
 */
export type RepeatMode = 'off' | 'once' | 'one'

/** Yang dibaca komponen: state utama + turunan queue. */
export type PlayerSnapshot = AudioPlayerState & PlayerQueueState

export interface PlayerError {
  code: PlayerErrorCode
  message: string
}

export interface AudioPlayerState {
  status: PlaybackStatus
  currentTrack: PlaylistTrack | null
  /**
   * Antrean aktif (snapshot lagu playlist saat lagu dipilih / Play All). Tetap utuh walau
   * playlist difilter di UI, dan diganti setiap pengguna memilih lagu dari playlist aktif.
   */
  queue: readonly PlaylistTrack[]
  /** Posisi lagu yang sedang diputar di dalam `queue` (0-based). Satu-satunya sumber posisi playback. */
  currentIndex: number | null
  /** Hasil endpoint play untuk permintaan terakhir. */
  playbackInfo: PlaybackInfo | null
  error: PlayerError | null
  /** Urutan acak (indeks queue) saat acak aktif; null jika nonaktif. Diganti bersama queue. */
  shuffleOrder: readonly number[] | null
}

/** Turunan dari `queue` + `currentIndex` (lihat utils/playerQueue.ts). */
export interface PlayerQueueState {
  hasPrevious: boolean
  hasNext: boolean
  /** Acak aktif atau tidak. Tersimpan di perangkat. */
  shuffle: boolean
  repeat: RepeatMode
  /** True saat lagu sedang dalam putaran ulang 1x (mode `once`). */
  repeatingOnce: boolean
}

/** Dipisah dari state karena berubah ±4 kali per detik. */
export interface PlaybackTime {
  currentTime: number
  /** Detik, dari elemen audio. null jika belum diketahui. */
  duration: number | null
  /** True hanya jika elemen audio mendukung seek untuk lagu ini. */
  seekable: boolean
}

export interface AudioPlayerActions {
  /**
   * Selalu meminta URL baru ke endpoint play lalu memutar dari awal. Queue disesuaikan dengan
   * playlist aktif, dan `index` menjadi posisi awal di dalamnya.
   */
  playTrack: PlayTrackHandler
  /**
   * Untuk tombol di UI: lagu yang sedang aktif di-jeda/dilanjutkan,
   * selain itu memanggil playTrack.
   */
  selectTrack: PlayTrackHandler
  /**
   * Memutar semua lagu yang diberikan berurutan, mulai dari lagu pertama. Queue diganti dengan
   * `tracks`; setiap lagu selesai, lagu berikutnya otomatis diputar sampai akhir queue.
   */
  playAll: PlayAllHandler
  /**
   * Melompat ke lagu pada posisi `index` di queue yang sedang berjalan (queue tidak diganti).
   * Dipakai tampilan Queue. Indeks di luar queue diabaikan.
   */
  playQueueItem: (index: number) => void
  togglePlayPause: () => void
  /** Memutar lagu berikutnya di queue. Tidak melakukan apa pun jika sudah di akhir. */
  playNext: () => void
  /**
   * Jika lagu sudah berjalan > 3 detik dan bisa di-seek: kembali ke 0:00.
   * Selain itu memutar lagu sebelumnya (atau mengulang dari awal bila ini lagu pertama).
   */
  playPrevious: () => void
  /** Menyalakan/mematikan acak. Lagu yang sedang diputar tidak terganggu. */
  toggleShuffle: () => void
  /** Berputar: off → once (ulang 1x) → one (ulang terus) → off. */
  cycleRepeat: () => void
  /** Memindahkan posisi putar. Diabaikan jika audio tidak mendukung seek. */
  seekTo: (seconds: number) => void
  /** Meminta URL baru untuk lagu aktif lalu memutar ulang (setelah error/selesai). */
  retry: () => void
  /** Membatalkan permintaan, menghentikan audio, dan mengosongkan state. */
  cleanup: () => void
}

/** Status tampilan untuk satu baris lagu. 'none' = bukan lagu aktif. */
export type RowActivity = 'none' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
