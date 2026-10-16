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
  | 'clip_only'
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
  /** Pemutaran berhenti saat lagu yang sedang berjalan selesai (sleep timer "akhir lagu"). */
  stopAfterTrack: boolean
  /** Lama crossfade antar lagu (detik); 0 = mati. Tersimpan di perangkat. */
  crossfadeSeconds: number
  /** False jika perangkat tidak bisa mengatur volume audio (iOS Safari): crossfade & fade tidak tersedia. */
  crossfadeSupported: boolean
}

/** Dipisah dari state karena berubah ±4 kali per detik. */
export interface PlaybackTime {
  currentTime: number
  /** Detik, dari elemen audio. null jika belum diketahui. */
  duration: number | null
  /** True hanya jika elemen audio mendukung seek untuk lagu ini. */
  seekable: boolean
}

/**
 * Hasil menambah lagu ke antrean.
 * started   belum ada yang diputar, jadi lagu ini langsung diputar (antreannya dimulai dari lagu ini)
 * added     masuk ke daftar "Berikutnya"
 * moved     sudah ada di daftar "Berikutnya", dipindah ke depan
 * duplicate sudah ada di daftar "Berikutnya", tidak diubah
 * current   lagu ini sedang diputar
 * blocked   lagu dari luar antrean ini, dan bukan dari hasil pencarian: tidak dicampur
 */
export type QueueAddResult = 'started' | 'added' | 'moved' | 'duplicate' | 'current' | 'blocked'

export interface QueueAddOptions {
  /**
   * True jika lagu dipilih dari hasil pencarian. Hanya itu yang boleh memasukkan lagu dari luar
   * antrean yang sedang berjalan; selain itu antrean tetap berisi satu sumber saja.
   */
  fromSearch?: boolean
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
   * `tracks`; setiap lagu selesai, lagu berikutnya otomatis diputar. Saat queue habis (dan berisi
   * lebih dari satu lagu), queue yang sama diputar ulang secara acak.
   */
  playAll: PlayAllHandler
  /**
   * Memutar `tracks` sebagai antrean baru, mulai dari posisi `index` (dipakai "Playlist saya").
   * Indeks di luar daftar diabaikan.
   */
  playList: (tracks: readonly PlaylistTrack[], index: number) => void
  /**
   * Melompat ke lagu pada posisi `index` di queue yang sedang berjalan (queue tidak diganti).
   * Dipakai tampilan Queue. Indeks di luar queue diabaikan.
   */
  playQueueItem: (index: number) => void
  /**
   * Memindahkan lagu di daftar "Berikutnya" dari posisi `from` ke `to` (0 = tepat setelah lagu aktif).
   * Lagu yang sedang diputar tidak terganggu.
   */
  moveUpcoming: (from: number, to: number) => void
  /** Menghapus lagu di posisi `position` pada daftar "Berikutnya" dari antrean. */
  removeUpcoming: (position: number) => void
  /**
   * Menambahkan lagu ke akhir daftar "Berikutnya". Lagu di luar antrean aktif hanya diterima jika
   * `fromSearch` (lagu satuan dari halaman Cari); selain itu hasilnya 'blocked'.
   */
  addToQueue: (track: PlaylistTrack, options?: QueueAddOptions) => QueueAddResult
  /** Menaruh lagu tepat setelah lagu yang sedang diputar. Aturan sumbernya sama dengan `addToQueue`. */
  playNextInQueue: (track: PlaylistTrack, options?: QueueAddOptions) => QueueAddResult
  togglePlayPause: () => void
  /** Menjeda jika sedang berjalan/memuat; tidak melakukan apa pun pada status lain (aman dipanggil timer). */
  pause: () => void
  /**
   * Berhenti (status `ended`) saat lagu yang sedang berjalan selesai, tanpa lanjut ke lagu berikutnya,
   * mengulang, atau memutar ulang antrean. Padam sendiri setelah terpakai.
   */
  setStopAfterTrack: (enabled: boolean) => void
  /**
   * Volume mengecil pelan selama `durationMs` sampai senyap, lalu musik dijeda (posisi tersimpan).
   * Dipakai sleep timer. Tanpa kontrol volume di perangkat, langsung dijeda.
   */
  fadeOutAndPause: (durationMs: number) => void
  /** Membatalkan fade-out yang sedang berjalan dan mengembalikan volume penuh. */
  cancelFade: () => void
  /** Mengatur crossfade antar lagu: 0 = mati, selain itu lamanya dalam detik. */
  setCrossfade: (seconds: number) => void
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
