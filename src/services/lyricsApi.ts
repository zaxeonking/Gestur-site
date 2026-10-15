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
const MAX_DURATION_DIFF_S = 8

export type LyricsResult =
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'plain'; lines: string[] }
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

function toResult(record: LrclibRecord): LyricsResult {
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics)
    if (lines.length > 0) return { kind: 'synced', lines }
  }
  if (record.plainLyrics) {
    return { kind: 'plain', lines: record.plainLyrics.split(/\r?\n/).map((line) => line.trimEnd()) }
  }
  return record.instrumental ? { kind: 'instrumental' } : { kind: 'none' }
}

function pickBest(records: LrclibRecord[], durationS: number | null): LrclibRecord | null {
  const usable = records.filter((r) => r.instrumental || r.syncedLyrics || r.plainLyrics)
  const close =
    durationS === null
      ? usable
      : usable.filter((r) => r.duration === null || Math.abs(r.duration - durationS) <= MAX_DURATION_DIFF_S)
  // Yang bertanda waktu lebih berguna daripada teks biasa.
  return close.find((r) => r.syncedLyrics) ?? close[0] ?? null
}

/** Mencari lirik lagu: cocok persis dulu (`/get`), lalu pencarian longgar (`/search`). */
export async function fetchLyrics(track: PlaylistTrack, options: { signal: AbortSignal }): Promise<LyricsResult> {
  const { signal } = options
  const durationS = parseDuration(track.duration)
  const artist = primaryArtist(track.artists)
  const title = cleanTitle(track.title) || track.title

  const exactParams: Record<string, string> = { track_name: track.title, artist_name: track.artists }
  if (track.album) exactParams.album_name = track.album
  if (durationS) exactParams.duration = String(Math.round(durationS))
  const exact = asRecord(await getJson('/get', exactParams, signal))
  if (exact && (exact.instrumental || exact.syncedLyrics || exact.plainLyrics)) return toResult(exact)

  const searches: Record<string, string>[] = [
    artist ? { track_name: title, artist_name: artist } : { track_name: title },
    { q: `${title} ${artist}`.trim() },
  ]
  for (const params of searches) {
    const raw = await getJson('/search', params, signal)
    if (!Array.isArray(raw)) continue
    const records = raw.map(asRecord).filter((r): r is LrclibRecord => r !== null)
    const best = pickBest(records, durationS)
    if (best) return toResult(best)
  }
  return { kind: 'none' }
}
