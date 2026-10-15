import type { Track } from '../types'
import type { PlaylistTrack } from '../types/spotify'
import { fallbackCover } from './fallbackCover'

export function toUiTrack(track: PlaylistTrack): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.artists,
    album: track.album,
    duration: track.duration,
    cover: fallbackCover(`${track.title}${track.album}`),
    coverUrl: track.cover || undefined,
    url: track.url,
  }
}
