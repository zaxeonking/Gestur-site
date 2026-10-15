export type CoverShape = 'rings' | 'bars' | 'sun' | 'dots'

export interface Cover {
  from: string
  to: string
  shape: CoverShape
}

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  cover: Cover
  /** Gambar cover dari API (jika ada); `cover` dipakai sebagai cadangan. */
  coverUrl?: string
  /** Tautan lagu di Spotify (data dari API). */
  url?: string
}

export interface Playlist {
  id: string
  title: string
  description: string
  trackCount: number
  cover: Cover
}

export interface Artist {
  id: string
  name: string
  cover: Cover
}

export interface Genre {
  id: string
  name: string
  cover: Cover
}
