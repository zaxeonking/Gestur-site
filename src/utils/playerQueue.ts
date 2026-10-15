import type { IndexedTrack, PlaylistTrack } from '../types/spotify'

/**
 * Fungsi murni untuk mengelola antrean (queue) pemutar. Tidak menyimpan state sendiri:
 * state queue (`queue` + `currentIndex`) tinggal di `AudioPlayerState` (useAudioPlayerController),
 * dan fungsi di sini hanya menghitung dari keduanya. Queue selalu berisi `PlaylistTrack`
 * sehingga cocok dengan tipe project.
 */

/** Queue kosong bersama; referensinya stabil sehingga tidak memicu render ulang. */
export const NO_TRACKS: readonly PlaylistTrack[] = Object.freeze([])

export interface ResolvedQueue {
  tracks: readonly PlaylistTrack[]
  /** Posisi lagu yang akan diputar di dalam `tracks`. */
  index: number
}

export function isValidIndex(tracks: readonly PlaylistTrack[], index: number | null): index is number {
  return index !== null && Number.isInteger(index) && index >= 0 && index < tracks.length
}

/**
 * Urutan putar acak: permutasi indeks queue (0..n-1). Queue aslinya tidak berubah, jadi tampilan
 * lain tetap konsisten; hanya urutan "siapa setelah siapa" yang mengikuti `order`.
 * `null` = acak nonaktif, urutan normal.
 */
export type ShuffleOrder = readonly number[] | null

/** Acak Fisher-Yates. Lagu `first` selalu di posisi pertama (lagu yang sedang/akan diputar). */
export function createShuffleOrder(length: number, first: number, random: () => number = Math.random): number[] {
  const rest: number[] = []
  for (let i = 0; i < length; i++) if (i !== first) rest.push(i)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return first >= 0 && first < length ? [first, ...rest] : rest
}

/** Order hanya dipakai jika cocok dengan queue (panjang sama dan memuat indeks aktif). */
export function isOrderUsable(order: ShuffleOrder, length: number, index: number | null): order is readonly number[] {
  return order !== null && order.length === length && index !== null && order.includes(index)
}

/** Indeks lagu berikutnya, atau null jika sudah di akhir queue (tanpa mengulang dari awal). */
export function getNextIndex(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder = null,
): number | null {
  if (!isValidIndex(tracks, index)) return null
  if (isOrderUsable(order, tracks.length, index)) return order[order.indexOf(index) + 1] ?? null
  return index + 1 < tracks.length ? index + 1 : null
}

/** Indeks lagu sebelumnya, atau null jika ini lagu pertama. */
export function getPreviousIndex(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder = null,
): number | null {
  if (!isValidIndex(tracks, index)) return null
  if (isOrderUsable(order, tracks.length, index)) {
    const position = order.indexOf(index)
    return position > 0 ? order[position - 1] : null
  }
  return index > 0 ? index - 1 : null
}

export function hasNext(tracks: readonly PlaylistTrack[], index: number | null, order: ShuffleOrder = null): boolean {
  return getNextIndex(tracks, index, order) !== null
}

export function hasPrevious(tracks: readonly PlaylistTrack[], index: number | null, order: ShuffleOrder = null): boolean {
  return getPreviousIndex(tracks, index, order) !== null
}

/**
 * Queue untuk lagu yang dipilih pengguna: seluruh playlist aktif, dengan posisi lagu itu.
 * `indexHint` (posisi asli di playlist, tidak terpengaruh filter) dipercaya hanya jika id-nya cocok;
 * jika tidak, posisi dicari lewat id. Lagu di luar playlist aktif diputar sendirian.
 */
export function resolveQueueForTrack(
  playlistTracks: readonly PlaylistTrack[],
  track: PlaylistTrack,
  indexHint: number,
): ResolvedQueue {
  if (playlistTracks[indexHint]?.id === track.id) return { tracks: playlistTracks, index: indexHint }
  const found = playlistTracks.findIndex((item) => item.id === track.id)
  if (found !== -1) return { tracks: playlistTracks, index: found }
  return { tracks: [track], index: 0 }
}

/** Lagu setelah posisi aktif, lengkap dengan indeksnya di `tracks` (dipakai tampilan Queue). */
export function getUpcomingTracks(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder = null,
): IndexedTrack[] {
  if (!isValidIndex(tracks, index)) return []
  if (isOrderUsable(order, tracks.length, index)) {
    return order.slice(order.indexOf(index) + 1).map((queueIndex) => ({ track: tracks[queueIndex], index: queueIndex }))
  }
  return tracks.slice(index + 1).map((track, offset) => ({ track, index: index + 1 + offset }))
}

/** Queue untuk Play All: semua lagu, mulai dari yang pertama. null jika tidak ada lagu. */
export function resolveQueueForPlayAll(tracks: readonly PlaylistTrack[]): ResolvedQueue | null {
  return tracks.length > 0 ? { tracks, index: 0 } : null
}

/* ------------------------------------------------------------------ */
/* Mengubah isi antrean                                                */
/* ------------------------------------------------------------------ */

/** Hasil pengubahan antrean: ketiganya harus disimpan bersama agar posisi playback tetap sinkron. */
export interface QueueEdit {
  queue: readonly PlaylistTrack[]
  currentIndex: number
  shuffleOrder: readonly number[] | null
}

/** Urutan putar sebagai daftar indeks queue (urutan acak bila aktif, selain itu 0..n-1). */
function getPlayOrder(length: number, index: number, order: ShuffleOrder): { base: number[]; shuffled: boolean } {
  if (isOrderUsable(order, length, index)) return { base: [...order], shuffled: true }
  return { base: Array.from({ length }, (_, i) => i), shuffled: false }
}

/**
 * Menyusun ulang queue mengikuti urutan putar baru. Mode acak tetap aktif: urutannya menjadi
 * 0..n-1 pada queue baru, jadi urutan yang diatur pengguna dihormati, bukan diacak ulang.
 */
function rebuildQueue(
  tracks: readonly PlaylistTrack[],
  playOrder: readonly number[],
  current: number,
  shuffled: boolean,
): QueueEdit {
  const queue = playOrder.map((i) => tracks[i])
  return {
    queue,
    currentIndex: playOrder.indexOf(current),
    shuffleOrder: shuffled ? queue.map((_, i) => i) : null,
  }
}

/**
 * Memindahkan satu lagu di daftar "Berikutnya". `from`/`to` adalah posisi di daftar itu
 * (0 = tepat setelah lagu aktif), sama dengan urutan yang dilihat pengguna. null = tidak ada perubahan.
 */
export function moveUpcomingTrack(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder,
  from: number,
  to: number,
): QueueEdit | null {
  if (!isValidIndex(tracks, index)) return null
  const { base, shuffled } = getPlayOrder(tracks.length, index, order)
  const head = base.slice(0, base.indexOf(index) + 1)
  const upcoming = base.slice(head.length)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return null
  if (from < 0 || from >= upcoming.length || to < 0 || to >= upcoming.length) return null
  const [moved] = upcoming.splice(from, 1)
  upcoming.splice(to, 0, moved)
  return rebuildQueue(tracks, [...head, ...upcoming], index, shuffled)
}

/** Menghapus satu lagu dari daftar "Berikutnya" (posisi seperti `moveUpcomingTrack`). Lagu aktif tidak bisa dihapus. */
export function removeUpcomingTrack(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder,
  position: number,
): QueueEdit | null {
  if (!isValidIndex(tracks, index)) return null
  const { base, shuffled } = getPlayOrder(tracks.length, index, order)
  const head = base.slice(0, base.indexOf(index) + 1)
  const upcoming = base.slice(head.length)
  if (!Number.isInteger(position) || position < 0 || position >= upcoming.length) return null
  upcoming.splice(position, 1)
  return rebuildQueue(tracks, [...head, ...upcoming], index, shuffled)
}

/**
 * Menyisipkan lagu ke daftar "Berikutnya": `next` = tepat setelah lagu aktif, `end` = paling akhir.
 * Lagu yang sama (id sama) tidak digandakan: `next` memindahkannya ke depan, `end` tidak mengubah apa pun.
 * null = tidak ada perubahan (tidak ada lagu aktif, lagu itu sedang diputar, atau sudah ada).
 */
export function insertUpcomingTrack(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder,
  track: PlaylistTrack,
  where: 'next' | 'end',
): QueueEdit | null {
  if (!isValidIndex(tracks, index)) return null
  if (tracks[index].id === track.id) return null
  const { base, shuffled } = getPlayOrder(tracks.length, index, order)
  const head = base.slice(0, base.indexOf(index) + 1)
  const upcoming = base.slice(head.length)
  const existing = upcoming.findIndex((i) => tracks[i].id === track.id)
  if (existing !== -1) {
    if (where === 'end' || existing === 0) return null
    const [moved] = upcoming.splice(existing, 1)
    upcoming.unshift(moved)
    return rebuildQueue(tracks, [...head, ...upcoming], index, shuffled)
  }
  const nextTracks = [...tracks, track]
  const added = tracks.length
  if (where === 'next') upcoming.unshift(added)
  else upcoming.push(added)
  return rebuildQueue(nextTracks, [...head, ...upcoming], index, shuffled)
}

/** Apakah lagu ini sudah ada di daftar "Berikutnya" (bukan lagu yang sedang diputar). */
export function isTrackUpcoming(
  tracks: readonly PlaylistTrack[],
  index: number | null,
  order: ShuffleOrder,
  trackId: string,
): boolean {
  return getUpcomingTracks(tracks, index, order).some((item) => item.track.id === trackId)
}
