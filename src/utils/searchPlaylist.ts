import type { PlaybackInfo, PlaylistDetail } from '../types/spotify'
import { extractSpotifyTrackLink, extractTrackId, isSafeHttpUrl } from './spotifyUrl'
import { normalizeSearchText } from './trackSearch'

/**
 * Membungkus hasil pencarian (judul atau tautan lagu) menjadi "playlist" berisi satu lagu agar bisa
 * tampil dan diputar lewat PlaylistView dan pemutar yang sama. Ditandai `source: 'search'`.
 * `url` berisi masukan pengguna (kata kunci atau tautan lagu), jadi "Muat ulang" dan "Coba lagi"
 * mengulang permintaan yang sama.
 */
export function buildSearchPlaylist(query: string, info: PlaybackInfo): PlaylistDetail {
  const trackLink = extractSpotifyTrackLink(query)
  const title = info.title.trim() || (trackLink ? 'Lagu tanpa judul' : query)

  // URL lagu wajib non-kosong (validasi Koleksi/Riwayat). Urutan: tautan yang diketik pengguna,
  // spotify_url dari API, lalu tautan pencarian Spotify (tanpa ID lagu) sebagai cadangan.
  const url =
    trackLink ??
    (isSafeHttpUrl(info.spotifyUrl) ? info.spotifyUrl : `https://open.spotify.com/search/${encodeURIComponent(title)}`)

  const slug = normalizeSearchText(query).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const id = trackLink ? `lagu-${extractTrackId(trackLink) ?? 'track'}` : `cari-${slug || 'lagu'}`

  return {
    id,
    url: query,
    title: trackLink ? title : `Hasil pencarian: ${query}`,
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
