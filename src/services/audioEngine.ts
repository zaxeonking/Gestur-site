import type { PlayerErrorCode } from '../types/player'

/**
 * Satu-satunya HTMLAudioElement di aplikasi. Komponen tidak boleh membuat
 * `new Audio()` sendiri; semuanya lewat AudioPlayerProvider → useAudioPlayer.
 *
 * Catatan CORS: elemen sengaja TIDAK diberi atribut `crossOrigin`. Tanpa atribut itu
 * browser memuat media dalam mode no-cors, jadi audio dari host mana pun bisa diputar
 * tanpa header CORS. Konsekuensinya audio tidak bisa dianalisis lewat Web Audio API.
 */

export type AudioEngineEventType =
  | 'play'
  | 'playing'
  | 'pause'
  | 'waiting'
  | 'timeupdate'
  | 'durationchange'
  | 'loadedmetadata'
  | 'progress'
  | 'seeked'
  | 'ended'
  | 'error'

export interface AudioEngineEvent {
  type: AudioEngineEventType
  currentTime: number
  /** null jika belum diketahui atau tak terhingga (stream). */
  duration: number | null
  /** audio.ended pada saat event dikirim. */
  ended: boolean
  /** True jika elemen audio melaporkan rentang yang bisa di-seek (lihat `isSeekable`). */
  seekable: boolean
  /** Hanya untuk event `error`: audio.error.code (1–4). */
  mediaErrorCode?: number
}

export type AudioEngineListener = (event: AudioEngineEvent) => void

export class AudioEngineError extends Error {
  readonly code: PlayerErrorCode | 'aborted'

  constructor(code: PlayerErrorCode | 'aborted', message: string) {
    super(message)
    this.name = 'AudioEngineError'
    this.code = code
  }
}

const EVENT_TYPES: AudioEngineEventType[] = [
  'play',
  'playing',
  'pause',
  'waiting',
  'timeupdate',
  'durationchange',
  'loadedmetadata',
  'progress',
  'seeked',
  'ended',
  'error',
]

/** WAV kosong (0 sampel). Dipakai untuk "membuka kunci" elemen saat gestur pengguna. */
const SILENT_SRC = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * Seek hanya aman jika durasi terhingga dan elemen melaporkan rentang `seekable`.
 * Stream langsung (durasi Infinity) atau server tanpa dukungan Range tidak lolos.
 */
export function isSeekable(audio: HTMLAudioElement): boolean {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return false
  const { seekable } = audio
  return seekable.length > 0 && seekable.end(seekable.length - 1) > 0
}

/** Memetakan error dari audio.play() (DOMException) ke kode aplikasi. */
export function toEngineError(error: unknown): AudioEngineError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'AbortError') return new AudioEngineError('aborted', 'Pemutaran dibatalkan.')
  if (name === 'NotAllowedError') return new AudioEngineError('blocked', 'Pemutaran diblokir browser.')
  if (name === 'NotSupportedError') return new AudioEngineError('unsupported', 'Sumber audio tidak didukung.')
  return new AudioEngineError('unknown', 'Audio gagal diputar.')
}

/** Memetakan audio.error.code (MediaError) ke kode aplikasi. null = abaikan. */
export function mediaErrorToCode(code: number | undefined): PlayerErrorCode | null {
  switch (code) {
    case 1: // MEDIA_ERR_ABORTED: dihentikan oleh kita sendiri
      return null
    case 2: // MEDIA_ERR_NETWORK
      return 'network'
    case 3: // MEDIA_ERR_DECODE
      return 'decode'
    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
      return 'unsupported'
    default:
      return 'unknown'
  }
}

class AudioEngine {
  private audio: HTMLAudioElement | null = null
  /**
   * URL yang sedang diminta pemanggil. Selama null (setelah stop/prime), semua
   * event dari elemen diabaikan, sehingga audio senyap atau sisa lagu lama
   * tidak pernah terbaca sebagai "Playing".
   */
  private activeSource: string | null = null
  private readonly listeners = new Set<AudioEngineListener>()

  private readonly handleDomEvent = (event: Event) => {
    const audio = this.audio
    if (!audio || this.activeSource === null) return
    const type = event.type as AudioEngineEventType
    this.emit({
      type,
      currentTime: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : null,
      ended: audio.ended,
      seekable: isSeekable(audio),
      mediaErrorCode: type === 'error' ? audio.error?.code : undefined,
    })
  }

  private emit(event: AudioEngineEvent) {
    for (const listener of [...this.listeners]) listener(event)
  }

  private element(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio()
      audio.preload = 'auto'
      for (const type of EVENT_TYPES) audio.addEventListener(type, this.handleDomEvent)
      this.audio = audio
    }
    return this.audio
  }

  subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Panggil SINKRON di dalam handler klik, sebelum menunggu jaringan.
   * Safari/iOS hanya mengizinkan play() jika elemen pernah dimulai oleh gestur
   * pengguna; setelah `await fetch` gestur itu sudah hangus. Memutar WAV senyap
   * lebih dulu membuat pemutaran sesungguhnya (setelah URL didapat) diizinkan.
   * Efek samping: audio sebelumnya langsung berhenti.
   */
  prime(): void {
    const audio = this.element()
    this.activeSource = null
    audio.src = SILENT_SRC
    audio.play().catch(() => {
      // Tidak masalah: hanya untuk membuka kunci.
    })
  }

  /** Memuat dan memutar URL. Resolve = play() diterima; status "playing" tetap menunggu event. */
  async load(url: string): Promise<void> {
    const audio = this.element()
    this.activeSource = url
    audio.src = url
    try {
      await audio.play()
    } catch (error) {
      throw toEngineError(error)
    }
  }

  async resume(): Promise<void> {
    if (!this.audio || this.activeSource === null) {
      throw new AudioEngineError('unknown', 'Tidak ada audio yang dimuat.')
    }
    try {
      await this.audio.play()
    } catch (error) {
      throw toEngineError(error)
    }
  }

  pause(): void {
    this.audio?.pause()
  }

  /**
   * Memindahkan posisi putar dan mengembalikan posisi yang benar-benar dipakai. Mengembalikan
   * null (tanpa mengubah apa pun) jika tidak ada audio aktif atau audio tidak mendukung seek.
   * Nilai dijepit ke rentang yang bisa di-seek.
   */
  seek(seconds: number): number | null {
    const audio = this.audio
    if (!audio || this.activeSource === null || !Number.isFinite(seconds) || !isSeekable(audio)) return null
    const last = audio.seekable.length - 1
    const target = Math.min(Math.max(seconds, audio.seekable.start(0)), audio.seekable.end(last))
    audio.currentTime = target
    return target
  }

  /** Menghentikan dan melepas sumber audio (koneksi unduhan ikut dilepas). */
  stop(): void {
    this.activeSource = null
    const audio = this.audio
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  /** Melepas elemen sepenuhnya. Aman dipanggil berulang; elemen dibuat lagi saat dibutuhkan. */
  dispose(): void {
    this.stop()
    const audio = this.audio
    if (!audio) return
    for (const type of EVENT_TYPES) audio.removeEventListener(type, this.handleDomEvent)
    this.audio = null
  }
}

/** Instans tunggal untuk seluruh aplikasi. */
export const audioEngine = new AudioEngine()
