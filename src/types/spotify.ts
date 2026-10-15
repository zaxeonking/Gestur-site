/** Bentuk respons mentah dari GET /api/spotifypl */
export interface SpotifyApiPlaylistInfo {
  cover: string
  title: string
}

export interface SpotifyApiTrack {
  cover: string
  title: string
  artists: string
  album: string
  duration: string
  url: string
}

export interface SpotifyApiPlaylistResponse {
  author?: string
  status: boolean
  data: SpotifyApiPlaylistInfo
  tracks: SpotifyApiTrack[]
}

/** Model yang dipakai aplikasi setelah respons divalidasi. */
export interface PlaylistTrack extends SpotifyApiTrack {
  /** ID unik di dalam playlist (aman untuk lagu yang muncul dua kali). */
  id: string
}

export interface PlaylistDetail {
  id: string
  /** URL playlist yang sudah dinormalisasi. */
  url: string
  title: string
  cover: string
  author?: string
  tracks: PlaylistTrack[]
  /**
   * 'search' = hasil pencarian judul (bukan playlist Spotify): `url` berisi kata kunci, tidak disimpan
   * ke penyimpanan perangkat dan tidak masuk Koleksi otomatis.
   */
  source?: 'search'
}

/**
 * Lagu beserta posisi aslinya di `PlaylistDetail.tracks`.
 * `index` tidak berubah walau daftar difilter, sehingga aman dipakai sebagai
 * posisi di antrean (queue) pemutar.
 */
export interface IndexedTrack {
  track: PlaylistTrack
  index: number
}

/** Dipanggil saat pengguna menekan Play pada sebuah lagu. */
export type PlayTrackHandler = (track: PlaylistTrack, index: number) => void

/** Dipanggil saat pengguna menekan Play All; menerima seluruh lagu playlist (tanpa filter). */
export type PlayAllHandler = (tracks: PlaylistTrack[]) => void

/* ------------------------------------------------------------------ */
/* Endpoint playback: GET /api/spotifyplay?q={judul}                   */
/* ------------------------------------------------------------------ */

/** Isi `data` pada respons /api/spotifyplay (setelah divalidasi). */
export interface SpotifyApiPlaybackData {
  title: string
  artist: string
  album: string
  duration: string
  year?: number
  cover: string
  spotify_url: string
  /** Bisa berupa tautan unduhan atau URL sementara, belum tentu stream audio langsung. */
  mp3_url: string
}

/** Respons /api/spotifyplay yang sudah divalidasi (`status` true dan `mp3_url` ada). */
export interface PlaybackResponse {
  status: boolean
  author?: string
  data: SpotifyApiPlaybackData
}

/** Model yang dipakai aplikasi untuk satu permintaan play. */
export interface PlaybackInfo {
  title: string
  artist: string
  album: string
  duration: string
  year?: number
  cover: string
  spotifyUrl: string
  /** URL audio yang diputar. Selalu diambil ulang untuk setiap permintaan play. */
  audioUrl: string
  /** Cuplikan ~30 detik (hanya dari NexaDev /api/spotify; opsional). */
  previewUrl?: string
  /** Sumber yang dipilih (kyzz, nexa-tautan, nexa-judul), untuk diagnosis. */
  source?: string
}
