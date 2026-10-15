import type { PlaylistTrack } from '../types/spotify'
import { extractTrackId } from './spotifyUrl'
import { normalizeSearchText } from './trackSearch'

/** Kunci pembeda lagu yang sama di beberapa sumber: ID lagu Spotify, atau judul + artis. */
function songKey(track: PlaylistTrack): string {
  const spotifyId = extractTrackId(track.url)
  return spotifyId ? `sp:${spotifyId}` : `tx:${normalizeSearchText(`${track.title}|${track.artists}`)}`
}

/**
 * Menggabungkan lagu dari beberapa sumber data NYATA (playlist aktif, Koleksi, riwayat putar)
 * menjadi satu daftar tanpa duplikat. Tidak membuat lagu baru; hanya menyusun ulang yang ada.
 *
 * - Urutan sumber = prioritas: kemunculan pertama dipertahankan, jadi taruh playlist aktif
 *   di depan agar lagunya tetap diputar dengan queue playlist tersebut.
 * - `id` lagu tidak diubah (pemutar memakainya untuk mencari queue dan menandai lagu aktif).
 *   Hanya jika dua lagu BERBEDA kebetulan memakai id yang sama, lagu kedua diberi akhiran unik.
 */
export function collectAllSongs(sources: readonly (readonly PlaylistTrack[])[]): PlaylistTrack[] {
  const seenSongs = new Set<string>()
  const usedIds = new Set<string>()
  const result: PlaylistTrack[] = []

  for (const list of sources) {
    for (const track of list) {
      if (!track.title.trim()) continue
      const key = songKey(track)
      if (seenSongs.has(key)) continue
      seenSongs.add(key)

      let id = track.id
      for (let n = 2; usedIds.has(id); n++) id = `${track.id}~${n}`
      usedIds.add(id)
      result.push(id === track.id ? track : { ...track, id })
    }
  }
  return result
}
