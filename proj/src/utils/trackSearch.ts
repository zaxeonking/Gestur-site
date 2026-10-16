import type { IndexedTrack, PlaylistTrack } from '../types/spotify'

/** Huruf kecil, tanpa aksen (é → e), spasi berlebih dirapikan. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SearchableTrack extends IndexedTrack {
  /** Judul + artis + album yang sudah dinormalisasi (dihitung sekali per playlist). */
  haystack: string
}

/**
 * Menempelkan indeks asli playlist dan teks pencarian ke setiap lagu.
 * Secara bawaan teks pencarian = judul + artis + album; `includeAlbum: false` hanya judul + artis.
 */
export function buildSearchIndex(
  tracks: readonly PlaylistTrack[],
  options: { includeAlbum?: boolean } = {},
): SearchableTrack[] {
  const { includeAlbum = true } = options
  return tracks.map((track, index) => ({
    track,
    index,
    haystack: normalizeSearchText(
      includeAlbum ? `${track.title} ${track.artists} ${track.album}` : `${track.title} ${track.artists}`,
    ),
  }))
}

/**
 * Menyaring berdasarkan judul, artis, dan album. Setiap kata kunci harus
 * ditemukan (urutan bebas). Urutan dan `index` asli dipertahankan.
 */
export function filterSearchIndex(entries: SearchableTrack[], query: string): SearchableTrack[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((entry) => terms.every((term) => entry.haystack.includes(term)))
}
