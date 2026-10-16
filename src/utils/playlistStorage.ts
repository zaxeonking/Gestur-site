import type { PlaylistDetail, PlaylistTrack } from '../types/spotify'
import { validateSpotifyPlaylistUrl } from './spotifyUrl'

const STORAGE_KEY = 'musicverse:last-playlist:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTrack(value: unknown): value is PlaylistTrack {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.artists === 'string' &&
    typeof value.album === 'string' &&
    typeof value.duration === 'string' &&
    typeof value.cover === 'string' &&
    typeof value.url === 'string'
  )
}

/** Data dari localStorage tidak dipercaya begitu saja: struktur diperiksa ulang. */
export function isPlaylistDetail(value: unknown): value is PlaylistDetail {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || !value.title) return false
  if (typeof value.cover !== 'string') return false
  if (value.author !== undefined && typeof value.author !== 'string') return false
  if (typeof value.url !== 'string' || !validateSpotifyPlaylistUrl(value.url).valid) return false
  return Array.isArray(value.tracks) && value.tracks.every(isTrack)
}

export function saveLastPlaylist(playlist: PlaylistDetail): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist))
  } catch {
    // Penyimpanan penuh atau diblokir: aplikasi tetap berjalan tanpa cache.
  }
}

export function loadLastPlaylist(): PlaylistDetail | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isPlaylistDetail(parsed)) return parsed
    localStorage.removeItem(STORAGE_KEY)
    return null
  } catch {
    return null
  }
}

export function clearLastPlaylist(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // diabaikan
  }
}
