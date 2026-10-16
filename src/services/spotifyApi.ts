import type {
  PlaybackInfo,
  PlaybackResponse,
  PlaylistDetail,
  PlaylistTrack,
  SpotifyApiPlaylistResponse,
  SpotifyApiTrack,
} from '../types/spotify'
import { scoreCandidate } from '../utils/matchTrack'
import { stripArtistPrefix } from '../utils/trackTitle'
import { extractSpotifyTrackLink, extractTrackId, isSafeHttpUrl, validateSpotifyPlaylistUrl } from '../utils/spotifyUrl'

const DEFAULT_BASE_URL = 'https://api.nexadev.my.id'
const PLAYLIST_PATH = '/api/spotifypl'
const PLAYBACK_PATH = '/api/spotifyplay'
/** API cadangan untuk memutar lagu lewat tautan Spotify-nya, dipakai jika API download (kyzz) gagal. */
const TRACK_PATH = '/api/spotify'

export const DEFAULT_TIMEOUT_MS = 15_000
/** Endpoint play mencari lagu di sisi server, jadi diberi waktu lebih longgar. */
export const PLAYBACK_TIMEOUT_MS = 30_000

/**
 * Browser memblokir (CORS) panggilan langsung ke api.nexadev.my.id dari situs lain,
 * jadi di situs yang di-deploy (bukan localhost/APK) request lewat proxy `/nexa`.
 * VITE_API_BASE_URL tetap menang jika diisi.
 */
function getBaseUrl(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host && host !== 'localhost' && host !== '127.0.0.1') return '/nexa'
  }
  return DEFAULT_BASE_URL
}

/* API download berbasis URL lagu (UTAMA; akurat: memutar persis lagu yang ditautkan). API cadangan jadi cadangannya. */
const DEFAULT_DOWNLOAD_BASE_URL = 'https://app.kyzznekoo.my.id'
const DOWNLOAD_PATH = '/api/download/spotify'
/** Nama parameter query untuk tautan lagu. ASUMSI: `url`. Ubah di sini jika API memakai nama lain. */
const DOWNLOAD_URL_PARAM = 'url'

function getDownloadBaseUrl(): string {
  const configured = import.meta.env?.VITE_DOWNLOAD_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  // Jika API utama dipasang lewat proxy (/nexa), API download otomatis ikut lewat proxy (/kyzz).
  return getBaseUrl() === '/nexa' ? '/kyzz' : DEFAULT_DOWNLOAD_BASE_URL
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

export type SpotifyApiErrorCode =
  | 'invalid_url'
  | 'invalid_query'
  | 'no_audio'
  | 'clip_only'
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
  /** API yang sudah terbukti memberi klip/cuplikan untuk lagu ini; dilewati. */
  avoid?: ReadonlyArray<'kyzz' | 'cadangan'>
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
/* API download berbasis URL lagu                                      */
/* ------------------------------------------------------------------ */

export function buildDownloadEndpoint(trackUrl: string): string {
  return `${getDownloadBaseUrl()}${DOWNLOAD_PATH}?${DOWNLOAD_URL_PARAM}=${encodeURIComponent(trackUrl)}`
}

/**
 * Memeriksa respons API download. `status: true` saja tidak cukup: `data.url` (audio) harus ada dan
 * berupa URL http(s). Metadata (`data.metadata`) opsional; field yang null dibaca sebagai teks kosong.
 */
export function parseDownloadResponse(body: unknown, trackUrl: string): PlaybackInfo {
  if (!isRecord(body)) {
    throw new SpotifyApiError('invalid_response', 'Respons server bukan objek JSON yang valid.')
  }
  if (typeof body.status !== 'boolean') {
    throw new SpotifyApiError('invalid_response', 'Respons server tidak memiliki field "status".')
  }
  if (!body.status) {
    throw new SpotifyApiError('api', readMessage(body) ?? 'API download melaporkan permintaan gagal.')
  }
  const { data } = body
  if (!isRecord(data)) {
    throw new SpotifyApiError('invalid_response', 'Data lagu pada respons tidak lengkap.')
  }
  const audioUrl = readString(data.url).trim()
  if (!audioUrl) {
    throw new SpotifyApiError('no_audio', 'Server tidak menyediakan audio untuk lagu ini.')
  }
  if (!isSafeHttpUrl(audioUrl)) {
    throw new SpotifyApiError('invalid_response', 'URL audio dari server tidak valid.')
  }
  const meta = isRecord(data.metadata) ? data.metadata : {}
  return {
    title: readString(meta.name),
    artist: readString(meta.artist),
    album: readString(meta.album),
    duration: readString(meta.duration),
    cover: readString(meta.image),
    spotifyUrl: trackUrl,
    audioUrl,
    apiSource: 'kyzz',
  }
}

/** Meminta audio + metadata untuk satu lagu lewat tautan Spotify-nya (selalu permintaan baru). */
async function requestDownload(trackUrl: string, options: FetchPlaylistOptions = {}): Promise<PlaybackInfo> {
  const { signal, timeoutMs = PLAYBACK_TIMEOUT_MS } = options
  const body = await requestJson(buildDownloadEndpoint(trackUrl), {
    signal,
    timeoutMs,
    httpMessage: playbackHttpMessage,
  })
  return parseDownloadResponse(body, trackUrl)
}

/* ------------------------------------------------------------------ */
/* API cadangan: /api/spotify?url={tautan lagu}                */
/* ------------------------------------------------------------------ */

export function buildTrackEndpoint(trackUrl: string): string {
  return `${getBaseUrl()}${TRACK_PATH}?url=${encodeURIComponent(trackUrl)}`
}

/**
 * Memeriksa respons /api/spotify. `data.url` = audio penuh (URL bertoken, bisa kedaluwarsa);
 * `data.preview` (cuplikan ~30 detik) SENGAJA diabaikan: hanya audio penuh yang boleh diputar.
 * Melempar SpotifyApiError jika `url` kosong atau bukan URL http(s) yang valid.
 */
export function parseTrackResponse(body: unknown, trackUrl: string): PlaybackInfo {
  if (!isRecord(body)) {
    throw new SpotifyApiError('invalid_response', 'Respons server bukan objek JSON yang valid.')
  }
  if (typeof body.status !== 'boolean') {
    throw new SpotifyApiError('invalid_response', 'Respons server tidak memiliki field "status".')
  }
  if (!body.status) {
    throw new SpotifyApiError('api', readMessage(body) ?? 'API melaporkan permintaan gagal. Lagu mungkin tidak ditemukan.')
  }
  const { data } = body
  if (!isRecord(data)) {
    throw new SpotifyApiError('invalid_response', 'Data lagu pada respons tidak lengkap.')
  }

  const fullUrl = readString(data.url).trim()
  if (fullUrl === '') {
    throw new SpotifyApiError('no_audio', 'Server tidak menyediakan audio untuk lagu ini.')
  }
  if (!isSafeHttpUrl(fullUrl)) {
    throw new SpotifyApiError('invalid_response', 'URL audio dari server tidak valid.')
  }

  // Judul API cadangan berformat "Judul - Artis"; pakai apa adanya (UI sudah punya judul dari playlist).
  return {
    title: readString(data.title),
    artist: readString(data.artist),
    album: '',
    duration: readString(data.duration),
    cover: readString(data.thumbnail),
    spotifyUrl: trackUrl,
    audioUrl: fullUrl,
    apiSource: 'cadangan',
  }
}

/** Meminta audio + metadata satu lagu ke API cadangan (selalu permintaan baru). */
async function requestTrack(trackUrl: string, options: FetchPlaylistOptions = {}): Promise<PlaybackInfo> {
  const { signal, timeoutMs = PLAYBACK_TIMEOUT_MS } = options
  const body = await requestJson(buildTrackEndpoint(trackUrl), {
    signal,
    timeoutMs,
    httpMessage: playbackHttpMessage,
  })
  return parseTrackResponse(body, trackUrl)
}

/**
 * Mengambil info audio lewat tautan lagu: API download (kyzz) dulu, lalu API cadangan.
 * Pembatalan (`aborted`) tidak pernah memicu cadangan.
 */
async function requestByLink(trackUrl: string, options: FetchPlaylistOptions = {}): Promise<PlaybackInfo> {
  const avoid = options.avoid ?? []
  const skipKyzz = avoid.includes('kyzz')
  const skipBackup = avoid.includes('cadangan')
  if (skipKyzz && skipBackup) {
    throw new SpotifyApiError('clip_only', 'Semua sumber hanya menyediakan cuplikan lagu, bukan audio penuh.')
  }
  // kyzz (audio penuh) dicoba sampai 3 kali sebelum pindah ke cadangan, karena permintaan kedua dan
  // seterusnya kadang gagal sesaat (rate limit/timeout).
  let lastError: unknown
  if (!skipKyzz) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await requestDownload(trackUrl, options)
      } catch (error) {
        if (error instanceof SpotifyApiError && error.code === 'aborted') throw error
        lastError = error
        console.warn(`[MusicVerse] API download (kyzz) gagal (percobaan ${attempt}/3):`, error)
        if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt))
      }
    }
  }
  if (skipBackup) throw lastError
  console.warn('[MusicVerse] Memakai API cadangan /spotify:', lastError)
  return requestTrack(trackUrl, options)
}

/* ------------------------------------------------------------------ */
/* Hand-off pencarian → pemutaran                                      */
/* ------------------------------------------------------------------ */

/**
 * Hasil pencarian sudah memuat URL audio. Agar menekan Play tidak memanggil API untuk kedua kalinya,
 * hasilnya disimpan sebentar dan dipakai SEKALI oleh pemutaran berikutnya untuk lagu yang sama.
 * Setelah itu (atau lewat 2 menit) selalu ambil URL audio baru, karena URL bisa bersifat sementara
 * (API download memakai token yang kedaluwarsa).
 * Kunci: tautan lagu Spotify jika ada, jika tidak judul (huruf kecil).
 */
const HANDOFF_TTL_MS = 2 * 60_000
const handoff = new Map<string, { info: PlaybackInfo; at: number }>()

function handoffKey(title: string, url: string | undefined): string {
  return extractSpotifyTrackLink(url ?? '') ?? `judul:${title.trim().toLowerCase()}`
}

function putHandoff(key: string, info: PlaybackInfo): void {
  const now = Date.now()
  for (const [k, entry] of handoff) if (now - entry.at > HANDOFF_TTL_MS) handoff.delete(k)
  handoff.set(key, { info, at: now })
}

function takeHandoff(key: string): PlaybackInfo | null {
  const entry = handoff.get(key)
  if (!entry) return null
  handoff.delete(key)
  return Date.now() - entry.at <= HANDOFF_TTL_MS ? entry.info : null
}

/** Mencari lagu lewat judul (endpoint play lama; server memilih lagu terdekat, TIDAK selalu akurat). */
export async function searchTrackByTitle(
  query: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  // Endpoint judul (spotifyplay) hanya dipakai untuk menemukan lagu + tautannya. `mp3_url`-nya
  // adalah cuplikan ~30 detik, jadi TIDAK dipakai: audio selalu diambil ulang lewat tautan lagu
  // (API download kyzz -> API cadangan /api/spotify), yaitu audio penuh.
  const found = await requestPlayback(query, options)
  const link = extractSpotifyTrackLink(found.spotifyUrl ?? '')
  if (!link) throw new SpotifyApiError('no_audio', 'Tautan lagu tidak ditemukan, audio penuh tidak bisa diambil.')
  const full = await requestByLink(link, options)
  const info: PlaybackInfo = {
    ...full,
    title: full.title || found.title,
    artist: full.artist || found.artist,
    album: full.album || found.album,
    duration: full.duration || found.duration,
    year: found.year,
    cover: full.cover || found.cover,
    spotifyUrl: link,
  }
  putHandoff(handoffKey(info.title || query, link), info)
  return info
}

/** Memuat satu lagu lewat tautan Spotify-nya (akurat). Urutan: API download (kyzz) → API cadangan /spotify. */
export async function searchTrackByLink(
  trackUrl: string,
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  const link = extractSpotifyTrackLink(trackUrl)
  if (!link) throw new SpotifyApiError('invalid_url', 'Tautan lagu Spotify tidak valid.')
  const info = await requestByLink(link, options)
  putHandoff(handoffKey(info.title, link), info)
  return info
}

/** Setelah satu sumber berhasil, sumber lain masih ditunggu sebentar supaya bisa dibandingkan. */
const COMPARE_GRACE_MS = 2500
/** Skor yang dianggap pasti cocok: langsung dipakai tanpa menunggu sumber lain. */
const CONFIDENT_SCORE = 1

interface Source {
  name: string
  viaLink: boolean
  run: (options: FetchPlaylistOptions) => Promise<PlaybackInfo>
}

/**
 * Info playback untuk pemutaran. SEMUA sumber dipanggil bersamaan:
 *  - kyzz (tautan lagu), API cadangan /api/spotify (tautan lagu), /api/spotifyplay (judul + artis).
 * Hasilnya dinilai terhadap data lagu di playlist (judul, artis, durasi, tautan) dan dipakai yang paling
 * cocok. Hasil yang pasti cocok langsung dipakai; jika tidak, sumber lain ditunggu hingga
 * COMPARE_GRACE_MS setelah hasil pertama. Hasil pencarian yang baru dibuat (sekali pakai) dipakai lebih dulu.
 */
export async function fetchPlaybackInfo(
  track: { title: string; url?: string; artists?: string; duration?: string },
  options: FetchPlaylistOptions = {},
): Promise<PlaybackInfo> {
  // Hasil hand-off bisa saja klip yang baru ditolak; saat ada API yang dihindari, selalu ambil baru.
  const handed = options.avoid?.length ? null : takeHandoff(handoffKey(track.title, track.url))
  if (handed) return handed

  const external = options.signal
  if (external?.aborted) throw new SpotifyApiError('aborted', 'Permintaan dibatalkan.')

  const link = extractSpotifyTrackLink(track.url ?? '')
  const titleQuery = [stripArtistPrefix(track.title, track.artists ?? ''), track.artists?.split(/\s*[,&;]\s*/)[0]].filter(Boolean).join(' ')
  const sources: Source[] = []
  if (link) {
    // Berurutan, bukan paralel: kyzz (audio penuh) diutamakan; API cadangan hanya jika kyzz gagal.
    // Sebelumnya keduanya paralel dan API cadangan bisa menang dengan audio ~30 detik.
    sources.push({ name: 'kyzz', viaLink: true, run: (o) => requestByLink(link, o) })
  }
  if (!link) {
    // Tanpa tautan: cari lewat judul hanya untuk menemukan tautan lagu, lalu ambil audio penuhnya.
    // `mp3_url` dari endpoint judul adalah cuplikan ~30 detik, jadi tidak pernah dipakai.
    sources.push({
      name: 'judul->tautan',
      viaLink: false,
      run: async (o) => {
        const found = await requestPlayback(titleQuery, o)
        const foundLink = extractSpotifyTrackLink(found.spotifyUrl ?? '')
        if (!foundLink) throw new SpotifyApiError('no_audio', 'Tautan lagu tidak ditemukan.')
        return requestByLink(foundLink, o)
      },
    })
  }

  const wanted = { title: track.title, artists: track.artists ?? '', duration: track.duration ?? '', url: track.url }
  const inner = new AbortController()
  const onExternalAbort = () => inner.abort()
  external?.addEventListener('abort', onExternalAbort, { once: true })

  return new Promise<PlaybackInfo>((resolve, reject) => {
    const results: Array<{ name: string; info: PlaybackInfo; score: number; order: number }> = []
    const errors: unknown[] = []
    let pending = sources.length
    let done = false
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    const finish = (action: () => void) => {
      if (done) return
      done = true
      clearTimeout(graceTimer)
      external?.removeEventListener('abort', onExternalAbort)
      inner.abort() // batalkan sumber yang masih berjalan
      action()
    }
    const pickBest = () => {
      // Skor sama: sumber yang lebih awal di daftar (kyzz) menang.
      const best = results.reduce((a, b) => (b.score > a.score ? b : a))
      console.info(
        '[MusicVerse] Kandidat audio:',
        results.map((r) => `${r.name}=${r.score.toFixed(2)}`).join(', '),
        '→ dipakai:',
        best.name,
      )
      resolve({ ...best.info, source: best.name })
    }
    const settleAll = () => {
      if (results.length > 0) return pickBest()
      const real = errors.find((e) => !(e instanceof SpotifyApiError && e.code === 'aborted'))
      reject(real ?? errors[0] ?? new SpotifyApiError('aborted', 'Permintaan dibatalkan.'))
    }

    external?.addEventListener('abort', () => finish(() => reject(new SpotifyApiError('aborted', 'Permintaan dibatalkan.'))), { once: true })

    sources.forEach((source, order) => {
      source
        .run({ ...options, signal: inner.signal })
        .then((info) => {
          if (done) return
          const score = scoreCandidate(wanted, info, source.viaLink)
          results.push({ name: source.name, info, score, order })
          results.sort((a, b) => a.order - b.order)
          if (score >= CONFIDENT_SCORE) return finish(pickBest)
          graceTimer ??= setTimeout(() => finish(pickBest), COMPARE_GRACE_MS)
        })
        .catch((error: unknown) => {
          if (done) return
          console.warn(`[MusicVerse] Sumber ${source.name} gagal:`, error)
          errors.push(error)
        })
        .finally(() => {
          if (done) return
          pending -= 1
          if (pending === 0) finish(settleAll)
        })
    })
  })
}
