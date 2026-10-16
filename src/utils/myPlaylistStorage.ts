import type { MyPlaylist, StorageHealth } from '../types/library'
import type { PlaylistTrack } from '../types/spotify'
import { parseStoredTrack, toStoredTrack } from './libraryStorage'
import { readJson, writeJson, type WriteOutcome } from './safeStorage'
import { extractTrackId } from './spotifyUrl'

/**
 * Penyimpanan "Playlist saya": playlist buatan pengguna di perangkat. Data dari penyimpanan dianggap
 * tidak tepercaya dan divalidasi ulang. Fungsi pengubah di bawah murni (tidak menyentuh penyimpanan)
 * supaya mudah diuji; context yang membaca-ubah-tulis.
 */

export const MY_PLAYLISTS_KEY = 'musicverse:my-playlists:v1'
const VERSION = 1
export const MAX_MY_PLAYLISTS = 100
export const MAX_MY_PLAYLIST_TRACKS = 1000
export const MAX_MY_PLAYLIST_NAME = 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function time(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Nama yang dirapikan (spasi ganda dihapus, dipotong ke batas), atau null jika kosong. */
export function cleanPlaylistName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MY_PLAYLIST_NAME).trim()
  return name === '' ? null : name
}

/* ------------------------------------------------------------------ */
/* Membaca / menulis                                                    */
/* ------------------------------------------------------------------ */

export function parseMyPlaylist(raw: unknown): MyPlaylist | null {
  if (!isRecord(raw)) return null
  const { id, name } = raw
  if (typeof id !== 'string' || !id.startsWith('my-') || typeof name !== 'string') return null
  const clean = cleanPlaylistName(name)
  if (!clean || !Array.isArray(raw.tracks)) return null

  const seen = new Set<string>()
  const tracks: PlaylistTrack[] = []
  for (const item of raw.tracks as unknown[]) {
    const track = parseStoredTrack(item)
    // ID harus unik: dipakai sebagai kunci baris dan penanda lagu aktif di antrean.
    if (!track || seen.has(track.id)) continue
    seen.add(track.id)
    tracks.push(track)
    if (tracks.length >= MAX_MY_PLAYLIST_TRACKS) break
  }
  const createdAt = time(raw.createdAt)
  return { id, name: clean, createdAt, updatedAt: time(raw.updatedAt) || createdAt, tracks }
}

export interface MyPlaylistsRead {
  items: MyPlaylist[]
  health: StorageHealth
}

export function readMyPlaylists(): MyPlaylistsRead {
  const outcome = readJson(MY_PLAYLISTS_KEY)
  if (outcome.status === 'unavailable') return { items: [], health: 'unavailable' }
  if (outcome.status === 'empty') return { items: [], health: 'ok' }
  if (outcome.status === 'corrupt') return { items: [], health: 'recovered' }
  const { value } = outcome
  if (!isRecord(value) || value.version !== VERSION || !Array.isArray(value.playlists)) {
    return { items: [], health: 'recovered' }
  }
  const entries = value.playlists as unknown[]
  const byId = new Map<string, MyPlaylist>()
  for (const entry of entries) {
    const parsed = parseMyPlaylist(entry)
    if (parsed && !byId.has(parsed.id)) byId.set(parsed.id, parsed)
  }
  const items = [...byId.values()].slice(0, MAX_MY_PLAYLISTS)
  return { items, health: items.length === entries.length ? 'ok' : 'recovered' }
}

export function writeMyPlaylists(list: readonly MyPlaylist[]): WriteOutcome {
  return writeJson(MY_PLAYLISTS_KEY, {
    version: VERSION,
    playlists: list.map((p) => ({ ...p, tracks: p.tracks.map(toStoredTrack) })),
  })
}

/* ------------------------------------------------------------------ */
/* Pengubah murni                                                       */
/* ------------------------------------------------------------------ */

export type MyPlaylistFailure = 'limit' | 'invalid' | 'duplicate' | 'missing'
export type MyPlaylistChange<T> = { ok: true; list: MyPlaylist[]; value: T } | { ok: false; reason: MyPlaylistFailure }

let counter = 0
function uid(): string {
  counter = (counter + 1) % 1_000_000
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Kunci untuk mendeteksi lagu yang sama (ID Spotify bila ada, selain itu URL). */
export function trackIdentity(track: Pick<PlaylistTrack, 'url'>): string {
  return extractTrackId(track.url) ?? track.url
}

export function createMyPlaylist(list: readonly MyPlaylist[], rawName: string, now = Date.now()): MyPlaylistChange<MyPlaylist> {
  const name = cleanPlaylistName(rawName)
  if (!name) return { ok: false, reason: 'invalid' }
  if (list.length >= MAX_MY_PLAYLISTS) return { ok: false, reason: 'limit' }
  const playlist: MyPlaylist = { id: `my-${uid()}`, name, createdAt: now, updatedAt: now, tracks: [] }
  return { ok: true, list: [playlist, ...list], value: playlist }
}

function update(
  list: readonly MyPlaylist[],
  id: string,
  change: (playlist: MyPlaylist) => MyPlaylist | MyPlaylistFailure,
): MyPlaylistChange<MyPlaylist> {
  const index = list.findIndex((item) => item.id === id)
  if (index === -1) return { ok: false, reason: 'missing' }
  const next = change(list[index])
  if (typeof next === 'string') return { ok: false, reason: next }
  const copy = [...list]
  copy[index] = next
  return { ok: true, list: copy, value: next }
}

export function renameMyPlaylist(list: readonly MyPlaylist[], id: string, rawName: string, now = Date.now()) {
  const name = cleanPlaylistName(rawName)
  if (!name) return { ok: false, reason: 'invalid' } as const
  return update(list, id, (p) => ({ ...p, name, updatedAt: now }))
}

export function deleteMyPlaylist(list: readonly MyPlaylist[], id: string): MyPlaylistChange<null> {
  if (!list.some((item) => item.id === id)) return { ok: false, reason: 'missing' }
  return { ok: true, list: list.filter((item) => item.id !== id), value: null }
}

/** Menambah salinan lagu di akhir playlist. Lagu yang sama (ID Spotify/URL) tidak ditambahkan dua kali. */
export function addTrackToMyPlaylist(list: readonly MyPlaylist[], id: string, track: PlaylistTrack, now = Date.now()) {
  return update(list, id, (p) => {
    const identity = trackIdentity(track)
    if (p.tracks.some((item) => trackIdentity(item) === identity)) return 'duplicate'
    if (p.tracks.length >= MAX_MY_PLAYLIST_TRACKS) return 'limit'
    const copy: PlaylistTrack = { ...toStoredTrack(track), id: `${uid()}-${extractTrackId(track.url) ?? 'track'}` }
    return { ...p, tracks: [...p.tracks, copy], updatedAt: now }
  })
}

export function removeTrackFromMyPlaylist(list: readonly MyPlaylist[], id: string, trackId: string, now = Date.now()) {
  return update(list, id, (p) => {
    if (!p.tracks.some((item) => item.id === trackId)) return 'missing'
    return { ...p, tracks: p.tracks.filter((item) => item.id !== trackId), updatedAt: now }
  })
}

/** Memindahkan lagu dari posisi `from` ke `to` (0-based). */
export function moveTrackInMyPlaylist(list: readonly MyPlaylist[], id: string, from: number, to: number, now = Date.now()) {
  return update(list, id, (p) => {
    const max = p.tracks.length - 1
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from > max || to > max) return 'invalid'
    if (from === to) return p
    const tracks = [...p.tracks]
    const [moved] = tracks.splice(from, 1)
    tracks.splice(to, 0, moved)
    return { ...p, tracks, updatedAt: now }
  })
}
