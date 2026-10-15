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

async function getJson(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown | null> {
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
    const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`
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

/**
 * Mencari lirik lagu: pencocokan persis (`/get`) dan dua pencarian longgar (`/search`) dijalankan bersamaan,
 * semua versi bertanda waktu dikumpulkan, lalu versi terdekat durasinya dengan lagu dipakai. Versi lain ikut
 * dikembalikan supaya pemutar bisa memilih ulang memakai durasi audio yang benar-benar terdengar.
 */
export async function fetchLyrics(track: PlaylistTrack, options: { signal: AbortSignal }): Promise<LyricsResult> {
  const { signal } = options
  const durationS = parseDuration(track.duration)
  const artist = primaryArtist(track.artists)
  const title = cleanTitle(track.title) || track.title

  const exactParams: Record<string, string> = { track_name: track.title, artist_name: track.artists }
  if (track.album) exactParams.album_name = track.album
  if (durationS) exactParams.duration = String(Math.round(durationS))

  const requests: Array<Promise<unknown | null>> = [
    getJson('/get', exactParams, signal),
    getJson('/search', artist ? { track_name: title, artist_name: artist } : { track_name: title }, signal),
    getJson('/search', { q: `${title} ${artist}`.trim() }, signal),
  ]
  const settled = await Promise.allSettled(requests)
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  const aborted = failures.find((f) => f.reason instanceof LyricsError && f.reason.code === 'aborted')
  if (aborted) throw aborted.reason

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

  const ranked = rankCandidates(records, durationS, title, artist)
  if (ranked.length > 0) {
    const [best, ...rest] = ranked
    return toResult(best, rest)
  }
  // Tidak ada hasil sama sekali DAN ada permintaan yang gagal: laporkan galatnya, jangan bilang "tidak ditemukan".
  if (failures.length > 0 && records.length === 0) throw failures[0].reason
  return { kind: 'none' }
}
