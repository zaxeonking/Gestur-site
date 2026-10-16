import type { PlayerErrorCode } from '../types/player'

/**
 * Satu-satunya pasangan HTMLAudioElement di aplikasi (aktif + cadangan untuk crossfade). Komponen tidak boleh
 * membuat `new Audio()` sendiri; semuanya lewat AudioPlayerProvider → useAudioPlayer.
 *
 * Catatan CORS: elemen sengaja TIDAK diberi atribut `crossOrigin`. Tanpa atribut itu
 * browser memuat media dalam mode no-cors, jadi audio dari host mana pun bisa diputar
 * tanpa header CORS. Konsekuensinya audio tidak bisa dianalisis lewat Web Audio API, jadi fade dan
 * crossfade memakai `audio.volume` pada dua elemen (aktif + cadangan), bukan GainNode.
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
  // Durasi NaN = metadata belum dimuat. Durasi Infinity (stream tanpa Content-Length) tetap boleh
  // di-seek selama browser melaporkan rentang `seekable`; batas akhirnya dijepit di `seek()`.
  if (Number.isNaN(audio.duration) || audio.duration <= 0) return false
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

/** Interval pembaruan volume saat fade. Waktu dihitung dari jam, jadi tetap benar walau interval ditunda. */
const RAMP_TICK_MS = 50

/** Kurva penguatan 0..1 sebagai fungsi progres t (0..1). */
type GainCurve = (t: number) => number

/** Daya sama: total kekerasan relatif stabil saat dua lagu bertukar (tanpa "lubang" di tengah). */
const FADE_IN_CURVE: GainCurve = (t) => Math.sin((t * Math.PI) / 2)
const FADE_OUT_CURVE: GainCurve = (t) => Math.cos((t * Math.PI) / 2)
/** Turun kuadratik: terdengar mengecil merata (telinga tidak linear), lalu senyap pelan di ujung. */
const SLEEP_CURVE: GainCurve = (t) => (1 - t) * (1 - t)

interface Ramp {
  /** Elemen audio yang diatur, atau 'master' untuk volume keseluruhan. */
  target: HTMLAudioElement | 'master'
  curve: GainCurve
  startedAt: number
  durationMs: number
  onDone?: () => void
}

/**
 * Volume lewat `audio.volume` berlaku di Android/desktop, tetapi iOS Safari mengabaikannya (selalu 1).
 * Tanpa kontrol volume, fade dan crossfade tidak mungkin; fitur itu dimatikan.
 */
function detectVolumeControl(): boolean {
  try {
    const probe = new Audio()
    probe.volume = 0.5
    return probe.volume === 0.5
  } catch {
    return false
  }
}

class AudioEngine {
  /** Elemen aktif: satu-satunya yang event-nya diteruskan ke pendengar. */
  private audio: HTMLAudioElement | null = null
  /** Elemen cadangan: memuat lagu berikutnya untuk crossfade; senyap sampai dipakai. */
  private standby: HTMLAudioElement | null = null
  /**
   * URL yang sedang diminta pemanggil. Selama null (setelah stop/prime), semua
   * event dari elemen diabaikan, sehingga audio senyap atau sisa lagu lama
   * tidak pernah terbaca sebagai "Playing".
   */
  private activeSource: string | null = null
  private standbySource: string | null = null
  private standbyUnlocked = false
  private readonly listeners = new Set<AudioEngineListener>()

  // Volume akhir elemen = master × trackEnd × gain elemen. Semuanya 0..1.
  private masterGain = 1
  private trackEndGain = 1
  private readonly elementGain = new Map<HTMLAudioElement, number>()
  private ramps: Ramp[] = []
  private rampTimer: ReturnType<typeof setInterval> | null = null
  /** Naik setiap reset; operasi async lama (crossfade yang sedang menunggu play()) membatalkan diri. */
  private epoch = 0
  private volumeControl: boolean | null = null

  private readonly handleDomEvent = (event: Event) => {
    const audio = this.audio
    // Hanya elemen aktif yang dilaporkan; elemen cadangan / lagu lama yang sedang memudar diabaikan.
    if (!audio || event.target !== audio || this.activeSource === null) return
    this.emitFrom(audio, event.type as AudioEngineEventType)
  }

  private emitFrom(audio: HTMLAudioElement, type: AudioEngineEventType) {
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

  private createElement(): HTMLAudioElement {
    const audio = new Audio()
    audio.preload = 'auto'
    for (const type of EVENT_TYPES) audio.addEventListener(type, this.handleDomEvent)
    this.elementGain.set(audio, 1)
    return audio
  }

  private element(): HTMLAudioElement {
    if (!this.audio) this.audio = this.createElement()
    if (!this.standby) this.standby = this.createElement()
    return this.audio
  }

  subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** False di perangkat yang mengabaikan `audio.volume` (iOS Safari): fade/crossfade tidak tersedia. */
  supportsVolumeFade(): boolean {
    if (this.volumeControl === null) this.volumeControl = detectVolumeControl()
    return this.volumeControl
  }

  // ---- Volume & fade ------------------------------------------------------------------------

  private applyVolume(audio: HTMLAudioElement) {
    const value = this.masterGain * this.trackEndGain * (this.elementGain.get(audio) ?? 1)
    audio.volume = Math.min(1, Math.max(0, value))
  }

  private applyAllVolumes() {
    if (this.audio) this.applyVolume(this.audio)
    if (this.standby) this.applyVolume(this.standby)
  }

  private setElementGain(audio: HTMLAudioElement, gain: number) {
    this.elementGain.set(audio, gain)
    this.applyVolume(audio)
  }

  private ramp(target: Ramp['target'], curve: GainCurve, durationMs: number, onDone?: () => void) {
    // Satu ramp per target: yang baru menggantikan yang lama.
    this.ramps = this.ramps.filter((item) => item.target !== target)
    this.ramps.push({ target, curve, startedAt: performance.now(), durationMs: Math.max(1, durationMs), onDone })
    if (this.rampTimer === null) this.rampTimer = setInterval(() => this.tickRamps(), RAMP_TICK_MS)
    this.tickRamps()
  }

  private tickRamps() {
    const now = performance.now()
    const finished: Ramp[] = []
    for (const item of [...this.ramps]) {
      const t = Math.min(1, (now - item.startedAt) / item.durationMs)
      const gain = item.curve(t)
      if (item.target === 'master') {
        this.masterGain = gain
        this.applyAllVolumes()
      } else {
        this.setElementGain(item.target, gain)
      }
      if (t >= 1) finished.push(item)
    }
    if (finished.length > 0) this.ramps = this.ramps.filter((item) => !finished.includes(item))
    if (this.ramps.length === 0 && this.rampTimer !== null) {
      clearInterval(this.rampTimer)
      this.rampTimer = null
    }
    for (const item of finished) item.onDone?.()
  }

  private clearRamps() {
    this.ramps = []
    if (this.rampTimer !== null) {
      clearInterval(this.rampTimer)
      this.rampTimer = null
    }
  }

  /** True selama dua lagu masih saling memudar. */
  isCrossfading(): boolean {
    return this.ramps.some((item) => item.target !== 'master')
  }

  /**
   * Volume mengecil pelan sampai senyap dalam `durationMs`, lalu menjeda (posisi tersimpan, bisa dilanjutkan).
   * Volume dikembalikan penuh SETELAH jeda, jadi saat dilanjutkan suaranya normal.
   */
  fadeOutAndPause(durationMs: number): void {
    if (!this.audio || this.activeSource === null || this.audio.paused) return
    if (!this.supportsVolumeFade() || durationMs <= 0) {
      this.pause()
      return
    }
    this.ramp('master', SLEEP_CURVE, durationMs, () => this.pause())
  }

  /** Membatalkan fade-out sleep timer dan mengembalikan volume penuh. */
  cancelFade(): void {
    this.ramps = this.ramps.filter((item) => item.target !== 'master')
    this.masterGain = 1
    this.applyAllVolumes()
  }

  /**
   * Penguatan akhir lagu (0..1) untuk sleep timer "setelah lagu ini selesai": dihitung ulang
   * dari posisi putar oleh pemanggil, jadi aman terhadap seek.
   */
  setTrackEndGain(gain: number): void {
    const next = this.supportsVolumeFade() ? Math.min(1, Math.max(0, gain)) : 1
    if (next === this.trackEndGain) return
    this.trackEndGain = next
    this.applyAllVolumes()
  }

  /** Mengembalikan semua volume ke penuh, membatalkan fade, dan melepas elemen cadangan. */
  private resetFades(): void {
    this.epoch++
    this.clearRamps()
    this.masterGain = 1
    this.trackEndGain = 1
    this.releaseStandby()
    for (const audio of this.elementGain.keys()) this.elementGain.set(audio, 1)
    this.applyAllVolumes()
  }

  // ---- Crossfade ----------------------------------------------------------------------------

  private releaseStandby() {
    const audio = this.standby
    this.standbySource = null
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    this.elementGain.set(audio, 1)
    this.applyVolume(audio)
  }

  /** Memuat lagu berikutnya di elemen cadangan (tanpa memutar). False jika belum bisa dipakai. */
  preload(url: string): boolean {
    this.element()
    const standby = this.standby
    if (!standby || this.activeSource === null || this.isCrossfading() || !this.supportsVolumeFade()) return false
    if (this.standbySource === url) return true
    this.standbySource = url
    this.elementGain.set(standby, 0)
    this.applyVolume(standby)
    standby.src = url
    return true
  }

  /** Membuang lagu yang sudah dimuat di elemen cadangan. */
  clearPreload(): void {
    if (this.standbySource !== null && !this.isCrossfading()) this.releaseStandby()
  }

  /** Lagu cadangan sudah cukup termuat untuk mulai tanpa jeda. */
  isPreloadReady(url: string): boolean {
    const standby = this.standby
    return (
      standby !== null &&
      this.standbySource === url &&
      !standby.error &&
      standby.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    )
  }

  /**
   * Memutar lagu cadangan dari 0:00 dengan volume naik sambil lagu aktif memudar, lalu elemen cadangan
   * menjadi elemen aktif. Mengembalikan true jika berpindah; false (tanpa mengubah apa pun pada lagu
   * yang sedang berjalan) jika play() ditolak atau engine di-reset di tengah jalan.
   * Event dari elemen baru langsung diteruskan setelah berpindah.
   */
  async crossfadeToStandby(durationMs: number): Promise<boolean> {
    const incoming = this.standby
    const outgoing = this.audio
    const url = this.standbySource
    if (!incoming || !outgoing || url === null || this.activeSource === null) return false
    const epoch = this.epoch
    this.setElementGain(incoming, 0)
    try {
      incoming.currentTime = 0
      await incoming.play()
    } catch {
      return false
    }
    if (epoch !== this.epoch) {
      incoming.pause()
      return false
    }
    this.audio = incoming
    this.standby = outgoing
    this.activeSource = url
    this.standbySource = null
    this.ramp(incoming, FADE_IN_CURVE, durationMs)
    this.ramp(outgoing, FADE_OUT_CURVE, durationMs, () => {
      // Hanya bersihkan jika elemen itu belum dipakai ulang untuk preload berikutnya.
      if (this.standby === outgoing && this.standbySource === null) this.releaseStandby()
    })
    // Metadata elemen baru sudah terbit saat masih cadangan (diabaikan); kirim ulang agar waktu/durasi menyusul.
    this.emitFrom(incoming, 'durationchange')
    return true
  }

  /** Menyelesaikan crossfade yang sedang berjalan seketika: lagu lama dilepas, lagu baru volume penuh. */
  private settleCrossfade() {
    if (!this.isCrossfading()) return
    this.ramps = this.ramps.filter((item) => item.target === 'master')
    if (this.audio) this.setElementGain(this.audio, 1)
    if (this.standbySource === null) this.releaseStandby()
  }

  // ---- Pemutaran ----------------------------------------------------------------------------

  /**
   * Panggil SINKRON di dalam handler klik, sebelum menunggu jaringan.
   * Safari/iOS hanya mengizinkan play() jika elemen pernah dimulai oleh gestur
   * pengguna; setelah `await fetch` gestur itu sudah hangus. Memutar WAV senyap
   * lebih dulu membuat pemutaran sesungguhnya (setelah URL didapat) diizinkan.
   * Efek samping: audio sebelumnya langsung berhenti. Elemen cadangan ikut dibuka kuncinya sekali,
   * agar crossfade nanti (tanpa gestur) boleh memutarnya.
   */
  prime(): void {
    const audio = this.element()
    this.resetFades()
    this.activeSource = null
    audio.src = SILENT_SRC
    audio.play().catch(() => {
      // Tidak masalah: hanya untuk membuka kunci.
    })
    const standby = this.standby
    if (standby && !this.standbyUnlocked) {
      this.standbyUnlocked = true
      standby.src = SILENT_SRC
      standby.play().catch(() => {})
    }
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
    // Jeda manual di tengah fade/crossfade: selesaikan dulu, lalu jeda; volume kembali penuh untuk lanjut.
    this.settleCrossfade()
    this.ramps = this.ramps.filter((item) => item.target !== 'master')
    this.audio?.pause()
    this.masterGain = 1
    this.applyAllVolumes()
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
    this.resetFades()
    const audio = this.audio
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  /** Melepas elemen sepenuhnya. Aman dipanggil berulang; elemen dibuat lagi saat dibutuhkan. */
  dispose(): void {
    this.stop()
    for (const audio of [this.audio, this.standby]) {
      if (!audio) continue
      for (const type of EVENT_TYPES) audio.removeEventListener(type, this.handleDomEvent)
      this.elementGain.delete(audio)
    }
    this.audio = null
    this.standby = null
    this.standbyUnlocked = false
  }
}

/** Instans tunggal untuk seluruh aplikasi. */
export const audioEngine = new AudioEngine()
