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

/** Indeks lagu berikutnya, atau null jika sudah di akhir queue (tanpa mengulang dari awal). */
export function getNextIndex(tracks: readonly PlaylistTrack[], index: number | null): number | null {
  if (!isValidIndex(tracks, index)) return null
  return index + 1 < tracks.length ? index + 1 : null
}

/** Indeks lagu sebelumnya, atau null jika ini lagu pertama. */
export function getPreviousIndex(tracks: readonly PlaylistTrack[], index: number | null): number | null {
  if (!isValidIndex(tracks, index)) return null
  return index > 0 ? index - 1 : null
}

export function hasNext(tracks: readonly PlaylistTrack[], index: number | null): boolean {
  return getNextIndex(tracks, index) !== null
}

export function hasPrevious(tracks: readonly PlaylistTrack[], index: number | null): boolean {
  return getPreviousIndex(tracks, index) !== null
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
export function getUpcomingTracks(tracks: readonly PlaylistTrack[], index: number | null): IndexedTrack[] {
  if (!isValidIndex(tracks, index)) return []
  return tracks.slice(index + 1).map((track, offset) => ({ track, index: index + 1 + offset }))
}

/** Queue untuk Play All: semua lagu, mulai dari yang pertama. null jika tidak ada lagu. */
export function resolveQueueForPlayAll(tracks: readonly PlaylistTrack[]): ResolvedQueue | null {
  return tracks.length > 0 ? { tracks, index: 0 } : null
}
