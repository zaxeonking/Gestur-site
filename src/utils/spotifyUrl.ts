export type PlaylistUrlInvalidReason = 'empty' | 'format' | 'host' | 'not_playlist' | 'id'

export type PlaylistUrlValidation =
  | { valid: true; playlistId: string; normalizedUrl: string }
  | { valid: false; reason: PlaylistUrlInvalidReason; message: string }

const SPOTIFY_HOST = 'open.spotify.com'
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/
const URI_PATTERN = /^spotify:playlist:([A-Za-z0-9]+)$/i

function invalid(reason: PlaylistUrlInvalidReason, message: string): PlaylistUrlValidation {
  return { valid: false, reason, message }
}

function build(playlistId: string): PlaylistUrlValidation {
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
    return invalid('id', 'ID playlist tidak valid. Salin ulang tautan dari Spotify.')
  }
  return {
    valid: true,
    playlistId,
    normalizedUrl: `https://${SPOTIFY_HOST}/playlist/${playlistId}`,
  }
}

/**
 * Memvalidasi tautan playlist Spotify dan menormalkannya menjadi
 * https://open.spotify.com/playlist/{id} (tanpa query seperti ?si=...).
 *
 * Format yang diterima:
 * - https://open.spotify.com/playlist/{id}
 * - https://open.spotify.com/intl-id/playlist/{id}
 * - https://open.spotify.com/embed/playlist/{id}
 * - https://open.spotify.com/user/{nama}/playlist/{id}
 * - spotify:playlist:{id}
 */
export function validateSpotifyPlaylistUrl(input: string): PlaylistUrlValidation {
  const value = input.trim()
  if (!value) return invalid('empty', 'Tempel tautan playlist Spotify terlebih dahulu.')

  const uriMatch = URI_PATTERN.exec(value)
  if (uriMatch) return build(uriMatch[1])

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return invalid('format', 'Format tautan tidak valid. Contoh: https://open.spotify.com/playlist/…')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return invalid('format', 'Gunakan tautan yang diawali https://')
  }
  if (url.hostname.toLowerCase() !== SPOTIFY_HOST) {
    return invalid('host', 'Tautan harus berasal dari open.spotify.com.')
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (/^intl-[a-z]{2,}(-[a-z]{2,})?$/i.test(segments[0] ?? '')) segments.shift()
  if (segments[0] === 'embed') segments.shift()
  if (segments[0] === 'user' && segments.length >= 4) segments.splice(0, 2)

  if (segments[0] !== 'playlist') {
    return invalid('not_playlist', 'Tautan ini bukan playlist Spotify. Salin tautan playlist, bukan lagu atau album.')
  }
  if (!segments[1]) {
    return invalid('id', 'Tautan playlist tidak memiliki ID. Salin ulang dari Spotify.')
  }

  return build(segments[1])
}

/** Mengambil ID lagu dari https://open.spotify.com/track/{id}, atau null. */
export function extractTrackId(trackUrl: string): string | null {
  try {
    const url = new URL(trackUrl)
    if (url.hostname.toLowerCase() !== SPOTIFY_HOST) return null
    const segments = url.pathname.split('/').filter(Boolean)
    const index = segments.indexOf('track')
    const id = index >= 0 ? segments[index + 1] : undefined
    return id && /^[A-Za-z0-9]+$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** True hanya untuk URL http(s) yang valid — dipakai sebelum merender gambar dari API. */
export function isSafeHttpUrl(value: string | undefined | null): value is string {
  if (!value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Tautan "buka di Spotify" untuk lagu aktif. Memakai URL lagu dari playlist lebih dulu
 * (itu lagu yang dipilih pengguna), lalu `spotify_url` dari endpoint play. Hanya
 * mengembalikan URL open.spotify.com yang valid; selain itu undefined (tombol disembunyikan).
 */
export function resolveSpotifyTrackUrl(...candidates: Array<string | undefined | null>): string | undefined {
  for (const candidate of candidates) {
    if (candidate && isSafeHttpUrl(candidate) && extractTrackId(candidate)) return candidate
  }
  return undefined
}

export type ImportInput =
  | { kind: 'empty' }
  /** Terlihat seperti tautan: divalidasi sebagai tautan playlist Spotify. */
  | { kind: 'playlist' }
  /** Bukan tautan: diperlakukan sebagai judul lagu. */
  | { kind: 'search'; query: string }

const MAX_QUERY_LENGTH = 200

/**
 * Menentukan apakah isi kolom impor adalah tautan playlist atau judul lagu.
 * Tautan = diawali skema (https://), `spotify:`, atau `open.spotify.com/`. Selain itu = judul.
 */
export function classifyImportInput(input: string): ImportInput {
  const value = input.trim()
  if (!value) return { kind: 'empty' }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^spotify:/i.test(value) || /^(www\.)?open\.spotify\.com\//i.test(value)) {
    return { kind: 'playlist' }
  }
  return { kind: 'search', query: value.slice(0, MAX_QUERY_LENGTH) }
}

/** Jumlah huruf minimum sebelum judul dicari otomatis (mengurangi permintaan ke API yang lambat). */
export const LIVE_SEARCH_MIN_LENGTH = 3

/**
 * Teks yang boleh dimuat otomatis (tanpa menekan tombol) untuk isi kolom saat ini, atau null.
 * - judul: minimal LIVE_SEARCH_MIN_LENGTH karakter
 * - tautan: hanya jika sudah menjadi tautan playlist Spotify yang valid (tautan setengah jadi
 *   tidak memunculkan pesan galat saat masih diketik)
 */
export function getLiveLoadTarget(input: string): string | null {
  const parsed = classifyImportInput(input)
  if (parsed.kind === 'search') return parsed.query.length >= LIVE_SEARCH_MIN_LENGTH ? parsed.query : null
  if (parsed.kind === 'playlist') return validateSpotifyPlaylistUrl(input).valid ? input.trim() : null
  return null
}
