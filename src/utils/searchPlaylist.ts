import type { PlaybackInfo, PlaylistDetail } from '../types/spotify'
import { extractTrackId, isSafeHttpUrl } from './spotifyUrl'
import { normalizeSearchText } from './trackSearch'

/**
 * Membungkus hasil pencarian judul menjadi "playlist" berisi satu lagu agar bisa tampil dan diputar
 * lewat PlaylistView dan pemutar yang sama. Ditandai `source: 'search'`.
 * `url` berisi kata kunci, jadi "Muat ulang" dan "Coba lagi" mengulang pencarian.
 */
export function buildSearchPlaylist(query: string, info: PlaybackInfo): PlaylistDetail {
  const title = info.title.trim() || query
  // URL lagu wajib non-kosong (validasi Koleksi/Riwayat). Cadangan: tautan pencarian Spotify (tanpa ID lagu).
  const url = isSafeHttpUrl(info.spotifyUrl)
    ? info.spotifyUrl
    : `https://open.spotify.com/search/${encodeURIComponent(title)}`
  const slug = normalizeSearchText(query).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

  return {
    id: `cari-${slug || 'lagu'}`,
    url: query,
    title: `Hasil pencarian: ${query}`,
    cover: info.cover,
    source: 'search',
    tracks: [
      {
        id: `0-${extractTrackId(url) ?? 'track'}`,
        title,
        artists: info.artist,
        album: info.album,
        duration: info.duration,
        cover: info.cover,
        url,
      },
    ],
  }
}
