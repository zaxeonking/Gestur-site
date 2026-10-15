import type { PlaybackInfo } from '../types/spotify'
import { parseDuration } from './formatTime'
import { extractTrackId } from './spotifyUrl'
import { normalizeSearchText } from './trackSearch'

/** Lagu di playlist yang dijadikan patokan. */
export interface WantedTrack {
  title: string
  artists: string
  duration: string
  url?: string
}

function tokens(value: string): string[] {
  return normalizeSearchText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function artistNames(value: string): string[] {
  return normalizeSearchText(value)
    .split(/\s*(?:,|&|;| feat\.? | ft\.? | and | x )\s*/)
    .map((name) => name.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** 0..1, atau null jika hasil tidak membawa data judul. */
function titleScore(wanted: WantedTrack, info: PlaybackInfo): number | null {
  const got = tokens(info.title)
  if (got.length === 0) return null
  const want = tokens(wanted.title)
  if (want.length === 0) return null
  const wantSet = new Set(want)
  const artistTokens = new Set(tokens(wanted.artists))
  // Judul NexaDev berformat "Judul - Artis": token artis tidak dihitung sebagai kelebihan.
  const gotTitleOnly = got.filter((t) => !artistTokens.has(t) || wantSet.has(t))
  const hit = want.filter((t) => got.includes(t)).length
  const coverage = hit / want.length
  const precision = gotTitleOnly.length === 0 ? coverage : Math.min(1, hit / gotTitleOnly.length)
  return 0.7 * coverage + 0.3 * precision
}

/** 0..1, atau null jika tidak ada data artis yang bisa dibandingkan. */
function artistScore(wanted: WantedTrack, info: PlaybackInfo): number | null {
  const wantNames = artistNames(wanted.artists)
  if (wantNames.length === 0) return null
  let haystack = normalizeSearchText(info.artist).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  if (!haystack.trim()) {
    // Tanpa field artis: hanya bisa dibaca dari judul berformat "Judul - Artis".
    if (!info.title.includes(' - ')) return null
    haystack = normalizeSearchText(info.title).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  }
  haystack = haystack.replace(/\s+/g, ' ')
  if (wantNames.some((name) => haystack.includes(name))) return 1
  const gotTokens = new Set(haystack.split(' ').filter(Boolean))
  const wantTokens = wantNames.flatMap((name) => name.split(' ')).filter(Boolean)
  const overlap = wantTokens.filter((t) => gotTokens.has(t)).length
  return overlap / Math.max(1, wantTokens.length) >= 0.5 ? 0.5 : 0
}

/** 0..1, atau null jika salah satu durasi tidak diketahui. */
function durationScore(wanted: WantedTrack, info: PlaybackInfo): number | null {
  const a = parseDuration(wanted.duration)
  const b = parseDuration(info.duration)
  if (a === null || b === null) return null
  const diff = Math.abs(a - b)
  if (diff <= 3) return 1
  if (diff <= 8) return 0.6
  if (diff <= 15) return 0.3
  return 0
}

/**
 * Seberapa cocok hasil API dengan lagu di playlist (judul, artis, durasi). Hasil dari tautan lagu
 * mendapat bonus karena server memang diminta lagu persis itu; hasil pencarian judul hanya mendapat
 * bonus jika tautan Spotify yang dikembalikan sama dengan tautan lagu di playlist.
 * Skor >= 1 dianggap pasti cocok. Nilai tidak dibatasi 1 supaya bonus bisa menjadi pembeda.
 */
export function scoreCandidate(wanted: WantedTrack, info: PlaybackInfo, viaLink: boolean): number {
  const parts: Array<[number | null, number]> = [
    [titleScore(wanted, info), 0.4],
    [artistScore(wanted, info), 0.25],
    [durationScore(wanted, info), 0.35],
  ]
  let weight = 0
  let sum = 0
  for (const [value, w] of parts) {
    if (value === null) continue
    weight += w
    sum += value * w
  }
  let score = weight > 0 ? sum / weight : 0.5
  if (viaLink) score += 0.15
  else {
    const wantedId = extractTrackId(wanted.url ?? '')
    const gotId = extractTrackId(info.spotifyUrl)
    if (wantedId && gotId && wantedId === gotId) score += 0.25
  }
  return score
}
