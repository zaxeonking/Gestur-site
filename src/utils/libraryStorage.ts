import type {
  LibraryPrefs,
  LibrarySort,
  LibraryView,
  RecentPlay,
  SavedPlaylist,
  StorageHealth,
} from '../types/library'
import type { PlaylistDetail, PlaylistTrack } from '../types/spotify'
import { readJson, writeJson, type WriteOutcome } from './safeStorage'
import { extractTrackId, validateSpotifyPlaylistUrl } from './spotifyUrl'

/**
 * Penyimpanan Koleksi. Tiga kunci terpisah, masing-masing berversi:
 * - playlist tersimpan   { version, playlists: SavedPlaylist[] }
 * - Recently Played      { version, items: RecentPlay[] }
 * - preferensi tampilan  { version, view, sort }
 *
 * Kunci `musicverse:last-playlist:v1` milik Beranda (playlist aktif) tidak disentuh.
 *
 * Aturan penting:
 * - Semua data dari localStorage dianggap tidak tepercaya dan divalidasi ulang saat dibaca.
 * - Lagu SELALU disalin lewat daftar field `PlaylistTrack` (whitelist). Field lain, termasuk
 *   `mp3_url` / `audioUrl` yang bersifat sementara dan bisa bertoken, tidak akan pernah ikut tersimpan.
 */

export const LIBRARY_KEYS = {
  playlists: 'musicverse:library:v1',
  recent: 'musicverse:recent:v1',
  prefs: 'musicverse:library-prefs:v1',
} as const

export const STORAGE_VERSION = 1
export const MAX_SAVED_PLAYLISTS = 30
export const MAX_RECENT_PLAYS = 20

export const DEFAULT_PREFS: LibraryPrefs = { view: 'grid', sort: 'recent' }

/* ------------------------------------------------------------------ */
/* Validasi                                                            */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function timestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Hanya field `PlaylistTrack`; field tambahan apa pun dibuang. */
export function toStoredTrack(track: PlaylistTrack): PlaylistTrack {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    album: track.album,
    duration: track.duration,
    cover: track.cover,
    url: track.url,
  }
}

/** Mengembalikan lagu yang bersih, atau null jika field wajib (id, judul, url) tidak valid. */
export function parseStoredTrack(raw: unknown): PlaylistTrack | null {
  if (!isRecord(raw)) return null
  const { id, title, url } = raw
  if (typeof id !== 'string' || !id) return null
  if (typeof title !== 'string' || !title.trim()) return null
  if (typeof url !== 'string' || !url.trim()) return null
  return toStoredTrack({
    id,
    title,
    url,
    artists: text(raw.artists),
    album: text(raw.album),
    duration: text(raw.duration),
    cover: text(raw.cover),
  })
}

function parseTracks(raw: unknown): PlaylistTrack[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const tracks: PlaylistTrack[] = []
  for (const item of raw) {
    const track = parseStoredTrack(item)
    // ID harus unik: dipakai sebagai kunci baris dan penanda lagu aktif di queue.
    if (!track || seen.has(track.id)) continue
    seen.add(track.id)
    tracks.push(track)
  }
  return tracks
}

export function parseSavedPlaylist(raw: unknown): SavedPlaylist | null {
  if (!isRecord(raw)) return null
  const { id, url, title } = raw
  if (typeof id !== 'string' || !id || typeof url !== 'string') return null
  if (typeof title !== 'string' || !title.trim()) return null
  if (raw.author !== undefined && typeof raw.author !== 'string') return null

  const tracks = parseTracks(raw.tracks)
  if (!tracks) return null

  // Hasil pencarian lagu: `url` berisi kata kunci/tautan lagu (bukan tautan playlist), jadi tidak
  // divalidasi sebagai playlist. Tanpa pengecualian ini lagu dari pencarian tidak pernah bisa disimpan.
  if (raw.source === 'search') {
    if (!url.trim() || tracks.length === 0) return null
    return {
      id,
      url: url.trim(),
      title: title.trim(),
      cover: text(raw.cover),
      source: 'search',
      tracks,
      savedAt: timestamp(raw.savedAt),
    }
  }

  // ID playlist harus cocok dengan URL-nya; keduanya divalidasi oleh aturan yang sama dengan form impor.
  const validation = validateSpotifyPlaylistUrl(url)
  if (!validation.valid || validation.playlistId !== id) return null

  return {
    id,
    url: validation.normalizedUrl,
    title: title.trim(),
    cover: text(raw.cover),
    ...(typeof raw.author === 'string' && raw.author ? { author: raw.author } : {}),
    tracks,
    savedAt: timestamp(raw.savedAt),
  }
}

export function parseRecentPlay(raw: unknown): RecentPlay | null {
  if (!isRecord(raw)) return null
  const track = parseStoredTrack(raw.track)
  if (!track) return null
  const playlistId = typeof raw.playlistId === 'string' && /^[A-Za-z0-9]{22}$/.test(raw.playlistId) ? raw.playlistId : undefined
  const playlistTitle = typeof raw.playlistTitle === 'string' && raw.playlistTitle.trim() ? raw.playlistTitle : undefined
  return {
    track,
    playedAt: timestamp(raw.playedAt),
    ...(playlistId ? { playlistId } : {}),
    ...(playlistId && playlistTitle ? { playlistTitle } : {}),
  }
}

export function parsePrefs(raw: unknown): LibraryPrefs {
  if (!isRecord(raw)) return DEFAULT_PREFS
  const view: LibraryView = raw.view === 'list' || raw.view === 'grid' ? raw.view : DEFAULT_PREFS.view
  const sort: LibrarySort = raw.sort === 'name' || raw.sort === 'recent' ? raw.sort : DEFAULT_PREFS.sort
  return { view, sort }
}

/* ------------------------------------------------------------------ */
/* Membaca                                                             */
/* ------------------------------------------------------------------ */

export interface LibraryRead<T> {
  items: T[]
  health: StorageHealth
}

/** Membaca daftar berversi `{ version, [field]: [...] }`; entri yang tidak valid dibuang dan dihitung. */
function readList<T>(key: string, field: string, parse: (raw: unknown) => T | null): LibraryRead<T> {
  const outcome = readJson(key)
  if (outcome.status === 'unavailable') return { items: [], health: 'unavailable' }
  if (outcome.status === 'empty') return { items: [], health: 'ok' }
  if (outcome.status === 'corrupt') return { items: [], health: 'recovered' }

  const { value } = outcome
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !Array.isArray(value[field])) {
    return { items: [], health: 'recovered' }
  }

  const entries = value[field] as unknown[]
  const items: T[] = []
  for (const entry of entries) {
    const parsed = parse(entry)
    if (parsed) items.push(parsed)
  }
  return { items, health: items.length === entries.length ? 'ok' : 'recovered' }
}

export function readSavedPlaylists(): LibraryRead<SavedPlaylist> {
  const result = readList(LIBRARY_KEYS.playlists, 'playlists', parseSavedPlaylist)
  // Satu ID hanya boleh muncul sekali; yang terbaru dipertahankan.
  const byId = new Map<string, SavedPlaylist>()
  for (const item of result.items) {
    const existing = byId.get(item.id)
    if (!existing || item.savedAt >= existing.savedAt) byId.set(item.id, item)
  }
  // Entri lagu satuan dari versi lama dibuang diam-diam (bukan data rusak); tertulis bersih pada simpanan berikutnya.
  const items = [...byId.values()].filter((item) => item.source !== 'search').slice(0, MAX_SAVED_PLAYLISTS)
  const health = byId.size === result.items.length ? result.health : 'recovered'
  return { items, health }
}

export function readRecentPlays(): LibraryRead<RecentPlay> {
  const result = readList(LIBRARY_KEYS.recent, 'items', parseRecentPlay)
  const seen = new Set<string>()
  const items = result.items
    .sort((a, b) => b.playedAt - a.playedAt)
    .filter((item) => {
      const key = recentKey(item.track)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_RECENT_PLAYS)
  return { items, health: result.health }
}

export function readPrefs(): LibraryPrefs {
  const outcome = readJson(LIBRARY_KEYS.prefs)
  return outcome.status === 'ok' ? parsePrefs(outcome.value) : DEFAULT_PREFS
}

/* ------------------------------------------------------------------ */
/* Menulis                                                             */
/* ------------------------------------------------------------------ */

export function writeSavedPlaylists(playlists: readonly SavedPlaylist[]): WriteOutcome {
  return writeJson(LIBRARY_KEYS.playlists, { version: STORAGE_VERSION, playlists })
}

export function writeRecentPlays(items: readonly RecentPlay[]): WriteOutcome {
  return writeJson(LIBRARY_KEYS.recent, { version: STORAGE_VERSION, items })
}

export function writePrefs(prefs: LibraryPrefs): WriteOutcome {
  return writeJson(LIBRARY_KEYS.prefs, { version: STORAGE_VERSION, ...prefs })
}

/* ------------------------------------------------------------------ */
/* Operasi murni pada daftar                                           */
/* ------------------------------------------------------------------ */

export type UpsertResult =
  | { ok: true; list: SavedPlaylist[] }
  | { ok: false; reason: 'limit' | 'invalid' | 'single' }

/**
 * Menyimpan (atau memperbarui) playlist. Playlist dengan ID yang sama diganti di tempat;
 * playlist baru ditambahkan di depan. Tidak ada yang dibuang diam-diam: jika Koleksi penuh,
 * hasilnya `limit` dan pemanggil memberi tahu pengguna.
 */
export function upsertSavedPlaylist(
  list: readonly SavedPlaylist[],
  playlist: PlaylistDetail,
  now: number = Date.now(),
): UpsertResult {
  // Lagu satuan (hasil cari judul / tautan lagu) bukan playlist: tidak boleh masuk Koleksi, apa pun jalurnya.
  if (playlist.source === 'search') return { ok: false, reason: 'single' }
  const entry = parseSavedPlaylist({
    id: playlist.id,
    url: playlist.url,
    title: playlist.title,
    cover: playlist.cover,
    author: playlist.author,
    source: playlist.source,
    tracks: playlist.tracks.map(toStoredTrack),
    savedAt: now,
  })
  if (!entry) return { ok: false, reason: 'invalid' }

  // Entri yang sama (ID sama, atau lagu pencarian yang sama) diganti di tempat, tidak digandakan.
  const match = findSavedMatch(list, playlist)
  if (!match && list.length >= MAX_SAVED_PLAYLISTS) return { ok: false, reason: 'limit' }
  return {
    ok: true,
    list: match ? list.map((item) => (item === match ? entry : item)) : [entry, ...list],
  }
}

/**
 * Entri Koleksi yang sama dengan `playlist`: ID yang sama, atau (untuk hasil pencarian) lagu yang sama
 * walau dicari dengan kata kunci berbeda. Dipakai untuk status tombol dan pencegahan duplikat.
 */
export function findSavedMatch(list: readonly SavedPlaylist[], playlist: PlaylistDetail): SavedPlaylist | undefined {
  return list.find((item) => item.id === playlist.id)
}

/** Kembali ke bentuk `PlaylistDetail` (tanpa metadata Koleksi) untuk dipakai sebagai playlist aktif. */
export function toPlaylistDetail(saved: SavedPlaylist): PlaylistDetail {
  return {
    id: saved.id,
    url: saved.url,
    title: saved.title,
    cover: saved.cover,
    ...(saved.author ? { author: saved.author } : {}),
    ...(saved.source ? { source: saved.source } : {}),
    tracks: saved.tracks,
  }
}

export function removeSavedPlaylist(list: readonly SavedPlaylist[], id: string): SavedPlaylist[] {
  return list.filter((item) => item.id !== id)
}

export function sortSavedPlaylists(list: readonly SavedPlaylist[], sort: LibrarySort): SavedPlaylist[] {
  const copy = [...list]
  if (sort === 'name') return copy.sort((a, b) => a.title.localeCompare(b.title, 'id', { sensitivity: 'base' }))
  return copy.sort((a, b) => b.savedAt - a.savedAt)
}

/** Kunci untuk menganggap dua entri sebagai lagu yang sama (ID lagu Spotify; cadangan: judul + artis). */
export function recentKey(track: PlaylistTrack): string {
  return extractTrackId(track.url) ?? `${track.title.trim().toLowerCase()}|${track.artists.trim().toLowerCase()}`
}

export interface RecentPlaySource {
  playlistId?: string
  playlistTitle?: string
}

/** Menaruh lagu di urutan teratas; pemutaran ulang lagu yang sama memindahkannya, bukan menggandakan. */
export function addRecentPlay(
  list: readonly RecentPlay[],
  track: PlaylistTrack,
  source: RecentPlaySource,
  now: number = Date.now(),
): RecentPlay[] {
  const key = recentKey(track)
  const previous = list.find((item) => recentKey(item.track) === key)
  // Putar ulang dari riwayat (lagu berdiri sendiri) tetap mengingat playlist asalnya.
  const playlistId = source.playlistId ?? previous?.playlistId
  const playlistTitle = source.playlistId ? source.playlistTitle : previous?.playlistTitle
  const entry: RecentPlay = {
    track: toStoredTrack(track),
    playedAt: now,
    ...(playlistId ? { playlistId } : {}),
    ...(playlistId && playlistTitle ? { playlistTitle } : {}),
  }
  return [entry, ...list.filter((item) => recentKey(item.track) !== key)].slice(0, MAX_RECENT_PLAYS)
}
