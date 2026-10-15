import type { PlaylistTrack } from '../types/spotify'
import { parseDuration } from '../utils/formatTime'
import { parseLrc, type LyricLine } from '../utils/lrc'

/**
 * Lirik dari LRCLIB (https://lrclib.net): gratis, tanpa kunci API. Dipanggil langsung dari browser;
 * jika browser/WebView memblokirnya (CORS) atau jaringan gagal, hasilnya error yang jelas, bukan lirik palsu.
 */
const BASE_URL = 'https://lrclib.net/api'
const TIMEOUT_MS = 12_000
/** Selisih durasi terbesar antara lagu dan data lirik yang masih dianggap lagu yang sama. */
const MAX_DURATION_DIFF_S = 25

/** Satu versi lirik bertanda waktu (LRCLIB bisa punya beberapa versi dengan durasi berbeda untuk lagu yang sama). */
export interface SyncedVersion {
  lines: LyricLine[]
  duration: number | null
}

export type LyricsResult =
  /** `duration`: durasi lagu pada data lirik (detik), untuk mendeteksi versi audio yang berbeda. */
  | { kind: 'synced'; lines: LyricLine[]; duration: number | null; alternatives: SyncedVersion[] }
  | { kind: 'plain'; lines: string[]; duration: number | null }
  | { kind: 'instrumental' }
  | { kind: 'none' }

export type LyricsErrorCode = 'network' | 'timeout' | 'bad_response' | 'aborted'

export class LyricsError extends Error {
  readonly code: LyricsErrorCode
  constructor(code: LyricsErrorCode, message: string) {
    super(message)
    this.name = 'LyricsError'
    this.code = code
  }
}

interface LrclibRecord {
  trackName: string
  artistName: string
  duration: number | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

/** Artis utama: "A, B" / "A & B" / "A feat. B" -> "A". */
export function primaryArtist(artists: string): string {
  return artists.split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0]?.trim() ?? ''
}

/** Judul tanpa "(feat. ...)", "[Remastered]" atau " - Remastered 2011" supaya pencarian lebih longgar. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .trim()
}

function asRecord(value: unknown): LrclibRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  const text = (field: unknown) => (typeof field === 'string' && field.trim() !== '' ? field : null)
  return {
    trackName: typeof item.trackName === 'string' ? item.trackName : '',
    artistName: typeof item.artistName === 'string' ? item.artistName : '',
    duration: typeof item.duration === 'number' && Number.isFinite(item.duration) ? item.duration : null,
    instrumental: item.instrumental === true,
    plainLyrics: text(item.plainLyrics),
    syncedLyrics: text(item.syncedLyrics),
  }
}

async function getJson(base: string, path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown | null> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', onAbort, { once: true })

  try {
    const url = `${base}${path}?${new URLSearchParams(params).toString()}`
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (response.status === 404) return null
    if (!response.ok) throw new LyricsError('bad_response', `Server lirik membalas dengan status ${response.status}.`)
    try {
      return await response.json()
    } catch {
      throw new LyricsError('bad_response', 'Balasan server lirik bukan JSON yang valid.')
    }
  } catch (error) {
    if (error instanceof LyricsError) throw error
    if (signal.aborted) throw new LyricsError('aborted', 'Permintaan lirik dibatalkan.')
    if (timedOut) throw new LyricsError('timeout', 'Server lirik tidak merespons tepat waktu.')
    throw new LyricsError('network', 'Tidak bisa menghubungi server lirik (jaringan putus atau diblokir browser).')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function toResult(record: LrclibRecord, others: LrclibRecord[] = []): LyricsResult {
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics)
    if (lines.length > 0) {
      // Versi lain (durasi berbeda) disertakan: pemutar memilih yang paling dekat dengan durasi audio sebenarnya.
      const alternatives: SyncedVersion[] = []
      for (const other of others) {
        if (!other.syncedLyrics) continue
        const parsed = parseLrc(other.syncedLyrics)
        if (parsed.length > 0) alternatives.push({ lines: parsed, duration: other.duration })
      }
      return { kind: 'synced', lines, duration: record.duration, alternatives }
    }
  }
  if (record.plainLyrics) {
    return {
      kind: 'plain',
      lines: record.plainLyrics.split(/\r?\n/).map((line) => line.trimEnd()),
      duration: record.duration,
    }
  }
  return record.instrumental ? { kind: 'instrumental' } : { kind: 'none' }
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Dua nama dianggap sama jika identik, atau yang satu memuat yang lain dan panjangnya tidak terlalu beda. */
function similarName(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return long.includes(short) && short.length / long.length >= 0.6
}

/**
 * Data lirik harus benar-benar lagu yang diminta: judul DAN artis cocok. Pencarian LRCLIB bisa mengembalikan
 * lagu lain yang mirip; tanpa pemeriksaan ini lirik yang tampil bisa milik lagu berbeda.
 */
export function matchesTrack(record: { trackName: string; artistName: string }, title: string, artist: string): boolean {
  if (!similarName(normalizeName(cleanTitle(record.trackName) || record.trackName), normalizeName(title))) return false
  const wanted = normalizeName(artist)
  const got = normalizeName(record.artistName)
  if (!wanted || !got) return true
  return got.includes(wanted) || wanted.includes(got)
}

/** Kandidat yang cocok judul + artis, diurutkan: durasi paling dekat dulu, yang bertanda waktu diutamakan. */
function rankCandidates(records: LrclibRecord[], durationS: number | null, title: string, artist: string): LrclibRecord[] {
  const candidates = records
    .filter((r) => r.instrumental || r.syncedLyrics || r.plainLyrics)
    .filter((r) => matchesTrack(r, title, artist))
    .filter((r) => durationS === null || r.duration === null || Math.abs(r.duration - durationS) <= MAX_DURATION_DIFF_S)
  const score = (r: LrclibRecord) =>
    (durationS !== null && r.duration !== null ? Math.abs(r.duration - durationS) : 5) + (r.syncedLyrics ? 0 : 20)
  return [...candidates].sort((a, b) => score(a) - score(b))
}

/* ------------------------------------------------------------------ */
/* Sumber lirik: LRCLIB, NetEase (lewat proxy di web), lyrics.ovh        */
/* ------------------------------------------------------------------ */

const NETEASE_DIRECT = 'https://music.163.com'
const LYRICS_OVH = 'https://api.lyrics.ovh/v1'

/** Web: lewat proxy /netease (CORS). APK Capacitor: langsung (CapacitorHttp tidak kena CORS). */
function neteaseBase(): string {
  const configured = import.meta.env?.VITE_LYRICS_NETEASE_BASE?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const cap = (typeof window !== 'undefined' ? (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor : undefined)
  return cap?.isNativePlatform?.() ? NETEASE_DIRECT : '/netease'
}

/** Baris kredit seperti "作词 : ..." / "Lyrics by: ..." bukan lirik; dibuang supaya tidak ikut disorot. */
const CREDIT_LINE = /^\s*\[[^\]]+\]\s*(?:作词|作曲|编曲|制作人?|混音|母带|监制|词|曲|lyrics?\s+by|music\s+by|composed?\s+by|produced?\s+by|arranged?\s+by)\s*[:：]/i

function stripCredits(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .filter((row) => !CREDIT_LINE.test(row))
    .join('\n')
}

async function lrclibRecords(track: PlaylistTrack, title: string, artist: string, durationS: number | null, signal: AbortSignal): Promise<LrclibRecord[]> {
  const exactParams: Record<string, string> = { track_name: track.title, artist_name: track.artists }
  if (track.album) exactParams.album_name = track.album
  if (durationS) exactParams.duration = String(Math.round(durationS))
  const settled = await Promise.allSettled([
    getJson(BASE_URL, '/get', exactParams, signal),
    getJson(BASE_URL, '/search', artist ? { track_name: title, artist_name: artist } : { track_name: title }, signal),
    getJson(BASE_URL, '/search', { q: `${title} ${artist}`.trim() }, signal),
  ])
  const records: LrclibRecord[] = []
  const exact = settled[0].status === 'fulfilled' ? asRecord(settled[0].value) : null
  if (exact) records.push(exact)
  for (const item of settled.slice(1)) {
    if (item.status !== 'fulfilled' || !Array.isArray(item.value)) continue
    for (const raw of item.value) {
      const record = asRecord(raw)
      if (record) records.push(record)
    }
  }
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed && records.length === 0) throw failed.reason
  return records
}

interface NeteaseSong {
  id: number
  name: string
  artist: string
  duration: number | null
}

function parseNeteaseSongs(body: unknown): NeteaseSong[] {
  if (typeof body !== 'object' || body === null) return []
  const result = (body as { result?: { songs?: unknown } }).result
  if (!result || !Array.isArray(result.songs)) return []
  const songs: NeteaseSong[] = []
  for (const raw of result.songs) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'number' || typeof item.name !== 'string') continue
    const people = Array.isArray(item.artists) ? item.artists : Array.isArray(item.ar) ? item.ar : []
    const artist = people
      .map((p) => (typeof p === 'object' && p !== null && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name : ''))
      .filter(Boolean)
      .join(', ')
    const ms = typeof item.duration === 'number' ? item.duration : typeof item.dt === 'number' ? item.dt : null
    songs.push({ id: item.id, name: item.name, artist, duration: ms !== null ? ms / 1000 : null })
  }
  return songs
}

/** NetEase Cloud Music: cari lagu, ambil lirik bertanda waktu untuk beberapa hasil teratas yang cocok. */
async function neteaseRecords(title: string, artist: string, signal: AbortSignal): Promise<LrclibRecord[]> {
  const base = neteaseBase()
  const search = await getJson(base, '/api/search/get', { s: `${title} ${artist}`.trim(), type: '1', limit: '8', offset: '0' }, signal)
  const songs = parseNeteaseSongs(search)
    .filter((song) => matchesTrack({ trackName: song.name, artistName: song.artist }, title, artist))
    .slice(0, 3)
  const settled = await Promise.allSettled(
    songs.map((song) => getJson(base, '/api/song/lyric', { id: String(song.id), lv: '-1', kv: '-1', tv: '-1' }, signal)),
  )
  const records: LrclibRecord[] = []
  settled.forEach((item, i) => {
    if (item.status !== 'fulfilled' || typeof item.value !== 'object' || item.value === null) return
    const lrc = (item.value as { lrc?: { lyric?: unknown } }).lrc?.lyric
    if (typeof lrc !== 'string' || !/\[\d{1,3}:\d{2}/.test(lrc)) return
    const song = songs[i]
    records.push({
      trackName: song.name,
      artistName: song.artist,
      duration: song.duration,
      instrumental: false,
      plainLyrics: null,
      syncedLyrics: stripCredits(lrc),
    })
  })
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed && records.length === 0 && songs.length > 0) throw failed.reason
  return records
}

/** lyrics.ovh: hanya teks biasa (tanpa waktu), dipakai sebagai cadangan terakhir. */
async function ovhRecords(title: string, artist: string, signal: AbortSignal): Promise<LrclibRecord[]> {
  if (!artist) return []
  const body = await getJson(LYRICS_OVH, `/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, {}, signal)
  const lyrics = typeof body === 'object' && body !== null ? (body as { lyrics?: unknown }).lyrics : null
  if (typeof lyrics !== 'string' || !lyrics.trim()) return []
  return [{ trackName: title, artistName: artist, duration: null, instrumental: false, plainLyrics: lyrics.trim(), syncedLyrics: null }]
}

/** Setelah ada versi bertanda waktu, sumber lain masih ditunggu sebentar supaya bisa dibandingkan. */
const SOURCE_GRACE_MS = 1500

/**
 * Mencari lirik dari BEBERAPA sumber sekaligus (LRCLIB, NetEase, lyrics.ovh). Semua versi bertanda waktu
 * dikumpulkan jadi satu daftar; yang durasinya paling dekat dengan lagu dipakai, sisanya dikembalikan
 * sebagai `alternatives` supaya pemutar bisa memilih ulang memakai durasi audio yang benar-benar terdengar.
 * Sumber yang gagal/diblokir tidak menggagalkan yang lain; galat baru dilaporkan jika SEMUA sumber gagal.
 */
export async function fetchLyrics(track: PlaylistTrack, options: { signal: AbortSignal }): Promise<LyricsResult> {
  const { signal } = options
  const durationS = parseDuration(track.duration)
  const artist = primaryArtist(track.artists)
  const title = cleanTitle(track.title) || track.title

  const jobs: Array<Promise<LrclibRecord[]>> = [
    lrclibRecords(track, title, artist, durationS, signal),
    neteaseRecords(title, artist, signal),
    ovhRecords(title, artist, signal),
  ]

  const records: LrclibRecord[] = []
  const errors: unknown[] = []
  await new Promise<void>((resolve) => {
    let pending = jobs.length
    let grace: ReturnType<typeof setTimeout> | undefined
    const onSettled = () => {
      pending -= 1
      if (pending === 0) {
        clearTimeout(grace)
        resolve()
      }
    }
    for (const job of jobs) {
      job
        .then((found) => {
          records.push(...found)
          if (!grace && found.some((r) => r.syncedLyrics)) grace = setTimeout(resolve, SOURCE_GRACE_MS)
        })
        .catch((error: unknown) => errors.push(error))
        .finally(onSettled)
    }
  })

  const aborted = errors.find((e) => e instanceof LyricsError && e.code === 'aborted')
  if (aborted || signal.aborted) throw aborted ?? new LyricsError('aborted', 'Permintaan lirik dibatalkan.')

  const ranked = rankCandidates(records, durationS, title, artist)
  if (ranked.length > 0) {
    const [best, ...rest] = ranked
    return toResult(best, rest)
  }
  // Tidak ada hasil DAN semua sumber gagal: laporkan galatnya, jangan bilang "tidak ditemukan".
  if (errors.length === jobs.length) throw errors[0]
  return { kind: 'none' }
}
