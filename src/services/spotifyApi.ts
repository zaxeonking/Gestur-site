import type {
  PlaybackInfo,
  PlaybackResponse,
  PlaylistDetail,
  PlaylistTrack,
  SpotifyApiPlaylistResponse,
  SpotifyApiTrack,
} from '../types/spotify'
import { extractTrackId, isSafeHttpUrl, validateSpotifyPlaylistUrl } from '../utils/spotifyUrl'

const DEFAULT_BASE_URL = 'https://api.nexadev.my.id'
const PLAYLIST_PATH = '/api/spotifypl'
const PLAYBACK_PATH = '/api/spotifyplay'

export const DEFAULT_TIMEOUT_MS = 15_000
/** Endpoint play mencari lagu di sisi server, jadi diberi waktu lebih longgar. */
export const PLAYBACK_TIMEOUT_MS = 30_000

function getBaseUrl(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL?.trim()
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

export type SpotifyApiErrorCode =
  | 'invalid_url'
  | 'invalid_query'
  | 'no_audio'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'http'
  | 'api'
  | 'invalid_response'

export class SpotifyApiError extends Error {
  readonly code: SpotifyApiErrorCode
  readonly status?: number
  readonly originalError?: unknown
  /** URL request yang gagal (diisi oleh requestJson), untuk diagnosis. */
  endpoint?: string

  constructor(
    code: SpotifyApiErrorCode,
    message: string,
    details: { status?: number; originalError?: unknown } = {},
  ) {
    super(message)
    this.name = 'SpotifyApiError'
    this.code = code
    this.status = details.status
    this.originalError = details.originalError
  }
}

function httpErrorMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage
  if (status === 400) return 'Permintaan ditolak server. Pastikan tautan playlist benar.'
  if (status === 403) return 'Akses ke playlist ditolak. Pastikan playlist bersifat publik.'
  if (status === 404) return 'Playlist tidak ditemukan. Pastikan tautan benar dan playlist bersifat publik.'
  if (status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
  if (status >= 500) return 'Server sedang bermasalah. Coba lagi beberapa saat lagi.'
  return `Permintaan gagal (HTTP ${status}).`
}

/* ------------------------------------------------------------------ */
/* Validasi struktur respons                                           */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  for (const key of ['message', 'error']) {
    const value = body[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200)
  }
  return undefined
}

function parseTrack(raw: unknown): SpotifyApiTrack | null {
  if (!isRecord(raw)) return null
  const { title, artists, album, duration, cover, url } = raw
  if (typeof title !== 'string' || !title.trim()) return null
  if (typeof url !== 'string' || !url.trim()) return null
  return {
    title: title.trim(),
    artists: typeof artists === 'string' ? artists : '',
    album: typeof album === 'string' ? album : '',
    duration: typeof duration === 'string' ? duration : '',
    cover: typeof cover === 'string' ? cover : '',
    url: url.trim(),
  }
}

/**
 * Memeriksa bahwa body sesuai kontrak API dan mengembalikannya sebagai
 * SpotifyApiPlaylistResponse. Melempar SpotifyApiError jika tidak sesuai.
 */
export function parsePlaylistResponse(body: unknown): SpotifyApiPlaylistResponse {
  if (!isRecord(body)) {
    throw new SpotifyApiError('invalid_response', 'Respons server bukan objek JSON yang valid.')
  }

  if (typeof body.status !== 'boolean') {
    throw new SpotifyApiError('invalid_response', 'Respons server tidak memiliki field "status".')
  }
  if (!body.status) {
    throw new SpotifyApiError(
      'api',
      readMessage(body) ?? 'API melaporkan permintaan gagal. Pastikan playlist bersifat publik.',
    )
  }

  const { data, tracks } = body
  if (!isRecord(data) || typeof data.title !== 'string' || !data.title.trim()) {
    throw new SpotifyApiError('invalid_response', 'Data playlist pada respons tidak lengkap.')
  }
  if (!Array.isArray(tracks)) {
    throw new SpotifyApiError('invalid_response', 'Daftar lagu pada respons tidak valid.')
  }

  const parsedTracks = tracks.map(parseTrack).filter((t): t is SpotifyApiTrack => t !== null)
  if (tracks.length > 0 && parsedTracks.length === 0) {
    throw new SpotifyApiError('invalid_response', 'Semua lagu pada respons memiliki format yang tidak valid.')
  }

  return {
    author: typeof body.author === 'string' ? body.author : undefined,
    status: true,
    data: {
      title: data.title.trim(),
      cover: typeof data.cover === 'string' ? data.cover : '',
    },
    tracks: parsedTracks,
  }
}

/* ------------------------------------------------------------------ */
/* fetchPlaylist                                                       */
/* ------------------------------------------------------------------ */

export interface FetchPlaylistOptions {
  /** Batalkan dari luar (mis. saat pengguna memuat playlist lain). */
  signal?: AbortSignal
  /** Batas waktu permintaan dalam milidetik. Default 15 detik. */
  timeoutMs?: number
}

export function buildPlaylistEndpoint(normalizedPlaylistUrl: string): string {
  return `${getBaseUrl()}${PLAYLIST_PATH}?url=${encodeURIComponent(normalizedPlaylistUrl)}`
}

async function readErrorBody(response: Response): Promise<string | undefined> {
  try {
    return readMessage(await response.json())
  } catch {
    return undefined
  }
}

interface RequestJsonOptions {
  signal?: AbortSignal
  timeoutMs: number
  httpMessage: (status: number, serverMessage?: string) => string
}

/**
 * GET JSON dengan timeout, pembatalan dari luar, dan error terklasifikasi.
 * Dipakai bersama oleh fetchPlaylist dan fetchPlaybackInfo.
 */
async function requestJson(endpoint: string, options: RequestJsonOptions): Promise<unknown> {
  const { signal, timeoutMs, httpMessage } = options

  if (signal?.aborted) {
    throw new SpotifyApiError('aborted', 'Permintaan dibatalkan.')
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort, { once: true })

  let body: unknown
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new SpotifyApiError('http', httpMessage(response.status, await readErrorBody(response)), {
        status: response.status,
      })
    }

    try {
      body = await response.json()
    } catch (error) {
      if (controller.signal.aborted) throw error
      throw new SpotifyApiError('invalid_response', 'Respons server bukan JSON yang valid.', {
        originalError: error,
      })
    }
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      error.endpoint ??= endpoint
      throw error
    }
    if (timedOut) {
      throw Object.assign(
        new SpotifyApiError(
          'timeout',
          `Server tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik. Coba lagi.`,
          { originalError: error },
        ),
        { endpoint },
      )
    }
    if (controller.signal.aborted || signal?.aborted) {
      throw Object.assign(new SpotifyApiError('aborted', 'Permintaan dibatalkan.', { originalError: error }), { endpoint })
    }
    throw Object.assign(
      new SpotifyApiError(
        'network',
        'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
        { originalError: error },
      ),
      { endpoint },
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  return body
}

export async function fetchPlaylist(
  playlistUrl: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaylistDetail> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const validation = validateSpotifyPlaylistUrl(playlistUrl)
  if (!validation.valid) {
    throw new SpotifyApiError('invalid_url', validation.message)
  }

  const body = await requestJson(buildPlaylistEndpoint(validation.normalizedUrl), {
    signal,
    timeoutMs,
    httpMessage: httpErrorMessage,
  })

  const parsed = parsePlaylistResponse(body)

  const tracks: PlaylistTrack[] = parsed.tracks.map((track, index) => ({
    ...track,
    id: `${index}-${extractTrackId(track.url) ?? 'track'}`,
  }))

  return {
    id: validation.playlistId,
    url: validation.normalizedUrl,
    title: parsed.data.title,
    cover: parsed.data.cover,
    author: parsed.author,
    tracks,
  }
}

/* ------------------------------------------------------------------ */
/* fetchPlaybackInfo                                                   */
/* ------------------------------------------------------------------ */

function playbackHttpMessage(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage
  if (status === 400) return 'Permintaan audio ditolak server.'
  if (status === 404) return 'Audio untuk lagu ini tidak ditemukan.'
  if (status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
  if (status >= 500) return 'Server audio sedang bermasalah. Coba lagi beberapa saat lagi.'
  return `Permintaan audio gagal (HTTP ${status}).`
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Memeriksa respons /api/spotifyplay. `status: true` saja tidak cukup:
 * `mp3_url` harus ada dan berupa URL http(s). Melempar SpotifyApiError jika tidak.
 */
export function parsePlaybackResponse(body: unknown): PlaybackResponse {
  if (!isRecord(body)) {
    throw new SpotifyApiError('invalid_response', 'Respons server bukan objek JSON yang valid.')
  }
  if (typeof body.status !== 'boolean') {
    throw new SpotifyApiError('invalid_response', 'Respons server tidak memiliki field "status".')
  }
  if (!body.status) {
    throw new SpotifyApiError(
      'api',
      readMessage(body) ?? 'API melaporkan permintaan gagal. Lagu mungkin tidak ditemukan.',
    )
  }

  const { data } = body
  if (!isRecord(data)) {
    throw new SpotifyApiError('invalid_response', 'Data lagu pada respons tidak lengkap.')
  }

  const mp3Url = readString(data.mp3_url).trim()
  if (!mp3Url) {
    throw new SpotifyApiError('no_audio', 'Server tidak menyediakan audio untuk lagu ini.')
  }
  if (!isSafeHttpUrl(mp3Url)) {
    throw new SpotifyApiError('invalid_response', 'URL audio dari server tidak valid.')
  }

  return {
    status: true,
    author: typeof body.author === 'string' ? body.author : undefined,
    data: {
      title: readString(data.title),
      artist: readString(data.artist),
      album: readString(data.album),
      duration: readString(data.duration),
      year: typeof data.year === 'number' && Number.isFinite(data.year) ? data.year : undefined,
      cover: readString(data.cover),
      spotify_url: readString(data.spotify_url),
      mp3_url: mp3Url,
    },
  }
}

export function buildPlaybackEndpoint(songTitle: string): string {
  return `${getBaseUrl()}${PLAYBACK_PATH}?q=${encodeURIComponent(songTitle)}`
}

/**
 * Meminta info playback untuk satu judul lagu ke server (selalu permintaan baru).
 */
async function requestPlayback(
  songTitle: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  const { signal, timeoutMs = PLAYBACK_TIMEOUT_MS } = options

  const query = songTitle.trim()
  if (!query) {
    throw new SpotifyApiError('invalid_query', 'Judul lagu kosong, audio tidak bisa dicari.')
  }

  const body = await requestJson(buildPlaybackEndpoint(query), {
    signal,
    timeoutMs,
    httpMessage: playbackHttpMessage,
  })

  const { data } = parsePlaybackResponse(body)
  return {
    title: data.title,
    artist: data.artist,
    album: data.album,
    duration: data.duration,
    year: data.year,
    cover: data.cover,
    spotifyUrl: data.spotify_url,
    audioUrl: data.mp3_url,
  }
}

/**
 * Ringkasan teknis error untuk ditampilkan di UI saat diagnosis (kode, status HTTP, URL request,
 * dan pesan asli dari browser). Untuk "network", pesan asli biasanya "Failed to fetch";
 * browser sengaja tidak membedakan CORS, DNS, atau offline.
 */
export function describeApiError(error: unknown): string {
  const lines: string[] = []
  if (error instanceof SpotifyApiError) {
    lines.push(`kode: ${error.code}`)
    if (error.status !== undefined) lines.push(`status HTTP: ${error.status}`)
    if (error.endpoint) lines.push(`request: GET ${error.endpoint}`)
    const original = error.originalError
    if (original instanceof Error) lines.push(`asli: ${original.name}: ${original.message}`)
    else if (original !== undefined) lines.push(`asli: ${String(original)}`)
  } else if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`)
  } else {
    lines.push(String(error))
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (origin) lines.push(`origin app: ${origin}`)
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* Hand-off pencarian → pemutaran                                      */
/* ------------------------------------------------------------------ */

/**
 * Hasil pencarian judul sudah memuat `mp3_url`. Agar menekan Play tidak memanggil endpoint yang
 * lambat itu untuk kedua kalinya, hasilnya disimpan sebentar dan dipakai SEKALI oleh pemutaran
 * berikutnya untuk judul yang sama. Setelah itu (atau lewat 2 menit) selalu ambil `mp3_url` baru,
 * karena URL bisa bersifat sementara.
 */
const HANDOFF_TTL_MS = 2 * 60_000
const handoff = new Map<string, { info: PlaybackInfo; at: number }>()

function handoffKey(title: string): string {
  return title.trim().toLowerCase()
}

function takeHandoff(title: string): PlaybackInfo | null {
  const key = handoffKey(title)
  const entry = handoff.get(key)
  if (!entry) return null
  handoff.delete(key)
  return Date.now() - entry.at <= HANDOFF_TTL_MS ? entry.info : null
}

/** Mencari lagu lewat judul (endpoint play) dan menyiapkan hand-off untuk pemutaran. */
export async function searchTrackByTitle(
  query: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  const info = await requestPlayback(query, options)
  const now = Date.now()
  for (const [key, entry] of handoff) if (now - entry.at > HANDOFF_TTL_MS) handoff.delete(key)
  handoff.set(handoffKey(info.title || query), { info, at: Date.now() })
  return info
}

/** Info playback untuk pemutaran: memakai hasil pencarian yang baru saja dibuat, jika ada. */
export async function fetchPlaybackInfo(
  songTitle: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  return takeHandoff(songTitle) ?? requestPlayback(songTitle, options)
}
