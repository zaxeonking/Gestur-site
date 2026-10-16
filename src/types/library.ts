import type { PlaylistDetail, PlaylistTrack } from './spotify'

/**
 * Playlist yang disimpan di perangkat. Strukturnya sama dengan `PlaylistDetail`
 * (dan lagunya `PlaylistTrack`), ditambah waktu simpan. Tidak ada URL audio di sini:
 * `mp3_url` dari endpoint play bersifat sementara dan tidak pernah disimpan.
 */
export interface SavedPlaylist extends PlaylistDetail {
  /** Epoch ms terakhir kali playlist ini disimpan atau diperbarui dari API. */
  savedAt: number
}

/** Satu lagu di riwayat putar. `track` adalah salinan `PlaylistTrack` (bisa langsung dimasukkan ke queue). */
export interface RecentPlay {
  track: PlaylistTrack
  /** Epoch ms saat lagu benar-benar mulai terdengar (status `playing`). */
  playedAt: number
  /** Playlist asal, jika diketahui. */
  playlistId?: string
  playlistTitle?: string
}

export type LibraryView = 'grid' | 'list'
export type LibrarySort = 'recent' | 'name'

export interface LibraryPrefs {
  view: LibraryView
  sort: LibrarySort
}

/**
 * ok          penyimpanan terbaca normal (kosong juga termasuk ok)
 * recovered   ada data rusak/tidak valid yang diabaikan
 * unavailable localStorage tidak bisa diakses; data hanya hidup selama tab terbuka
 */
export type StorageHealth = 'ok' | 'recovered' | 'unavailable'

/**
 * Playlist buatan pengguna ("Playlist saya"). Terpisah dari Koleksi: Koleksi = salinan playlist Spotify yang
 * pernah dimuat (dibatasi), sedangkan ini dibuat, diberi nama, dan diisi lagu sendiri. `id` selalu diawali `my-`.
 * Setiap lagu di `tracks` memakai `id` unik di dalam playlist ini (bukan ID Spotify).
 */
export interface MyPlaylist {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  tracks: PlaylistTrack[]
}
