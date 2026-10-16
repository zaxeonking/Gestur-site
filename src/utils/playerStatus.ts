import type { PlaybackStatus, RowActivity } from '../types/player'
import type { PlaybackInfo, PlaylistTrack } from '../types/spotify'
import { normalizeSearchText } from './trackSearch'

export function getRowActivity(status: PlaybackStatus): RowActivity {
  switch (status) {
    case 'resolving':
    case 'loading':
    case 'buffering':
      return 'loading'
    case 'playing':
      return 'playing'
    case 'paused':
      return 'paused'
    case 'ended':
      return 'ended'
    case 'error':
      return 'error'
    default:
      return 'none'
  }
}

export const STATUS_TEXT: Record<PlaybackStatus, string> = {
  idle: '',
  resolving: 'Mencari audio…',
  loading: 'Memuat audio…',
  buffering: 'Buffering…',
  playing: 'Sedang diputar',
  paused: 'Dijeda',
  ended: 'Selesai diputar',
  error: 'Gagal diputar',
}

/**
 * Endpoint play dicari dengan judul saja, jadi hasilnya bisa saja lagu lain
 * dengan judul sama. Pemeriksaan longgar ini hanya untuk memberi peringatan di UI.
 */
export function looksLikeSameTrack(track: PlaylistTrack, info: PlaybackInfo): boolean {
  const wantedTitle = normalizeSearchText(track.title)
  const gotTitle = normalizeSearchText(info.title)
  if (gotTitle && wantedTitle && !gotTitle.includes(wantedTitle) && !wantedTitle.includes(gotTitle)) {
    return false
  }
  const wantedArtists = normalizeSearchText(track.artists)
  const gotArtists = normalizeSearchText(info.artist)
  if (!wantedArtists || !gotArtists) return true
  const names = gotArtists.split(/\s*(?:,|&|;| feat\.? | ft\.? | and )\s*/).filter(Boolean)
  return names.some((name) => wantedArtists.includes(name)) || gotArtists.includes(wantedArtists)
}
