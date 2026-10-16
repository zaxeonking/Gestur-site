import type { PlaylistTrack } from '../types/spotify'
import { parseStoredTrack } from './libraryStorage'
import { readJson, removeKey, writeJson } from './safeStorage'

/**
 * Sesi pemutar yang disimpan di perangkat supaya antrean, lagu aktif, dan posisinya bertahan saat app
 * ditutup. Dipisah dua kunci: antrean (besar, ditulis hanya saat berubah) dan posisi (kecil, ditulis
 * sering). Semua data dari penyimpanan dianggap tidak tepercaya dan divalidasi ulang.
 */

const QUEUE_KEY = 'musicverse.player.queue.v1'
const POSITION_KEY = 'musicverse.player.position.v1'
/** Batas panjang antrean yang disimpan: menjaga ukuran tetap kecil dan tulis tidak kena kuota. */
const MAX_QUEUE = 500

export interface SavedSession {
  queue: PlaylistTrack[]
  index: number
  /** Urutan acak yang tersimpan, atau null. Pemanggil memvalidasi terhadap antrean. */
  shuffleOrder: number[] | null
  /** Detik. 0 jika tidak ada posisi yang cocok dengan lagu aktif. */
  position: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Menyimpan antrean + lagu aktif + urutan acak. Antrean terlalu panjang: dipangkas di sekitar lagu aktif. */
export function savePlayerQueue(queue: readonly PlaylistTrack[], index: number, shuffleOrder: readonly number[] | null): void {
  if (queue.length > MAX_QUEUE) {
    // Pangkas agar indeks tetap benar: simpan jendela di sekitar lagu aktif, tanpa urutan acak.
    const start = Math.max(0, Math.min(index - Math.floor(MAX_QUEUE / 2), queue.length - MAX_QUEUE))
    queue = queue.slice(start, start + MAX_QUEUE)
    index -= start
    shuffleOrder = null
  }
  writeJson(QUEUE_KEY, {
    v: 1,
    index,
    shuffleOrder,
    tracks: queue.map((t) => ({
      id: t.id,
      title: t.title,
      artists: t.artists,
      album: t.album,
      duration: t.duration,
      cover: t.cover,
      url: t.url,
    })),
  })
}

/** Menyimpan posisi putar (detik) untuk lagu `trackId`. */
export function savePlayerPosition(trackId: string, seconds: number): void {
  writeJson(POSITION_KEY, { v: 1, trackId, seconds: Math.max(0, Math.floor(seconds)) })
}

export function clearPlayerSession(): void {
  removeKey(QUEUE_KEY)
  removeKey(POSITION_KEY)
}

/** Membaca sesi tersimpan; null jika kosong, rusak, atau tidak konsisten. */
export function loadPlayerSession(): SavedSession | null {
  const result = readJson(QUEUE_KEY)
  if (result.status !== 'ok' || !isRecord(result.value) || !Array.isArray(result.value.tracks)) return null
  const raw = result.value

  const queue: PlaylistTrack[] = []
  const seen = new Set<string>()
  for (const item of raw.tracks as unknown[]) {
    const track = parseStoredTrack(item)
    // Satu item rusak menggeser indeks: tolak seluruh sesi daripada memutar lagu yang salah.
    if (!track || seen.has(track.id)) return null
    seen.add(track.id)
    queue.push(track)
  }
  const index = raw.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= queue.length) return null

  let shuffleOrder: number[] | null = null
  if (Array.isArray(raw.shuffleOrder) && raw.shuffleOrder.length === queue.length) {
    const order = raw.shuffleOrder as unknown[]
    const valid =
      order.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < queue.length) &&
      new Set(order).size === queue.length
    if (valid) shuffleOrder = order as number[]
  }

  let position = 0
  const pos = readJson(POSITION_KEY)
  if (pos.status === 'ok' && isRecord(pos.value)) {
    const { trackId, seconds } = pos.value
    if (trackId === queue[index].id && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      position = seconds
    }
  }
  return { queue, index, shuffleOrder, position }
}
