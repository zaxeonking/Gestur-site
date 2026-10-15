import { useMemo } from 'react'
import type { Cover } from '../types'
import { fallbackCover } from '../utils/fallbackCover'
import { resolveSpotifyTrackUrl } from '../utils/spotifyUrl'
import { useAudioPlayer } from './useAudioPlayer'

export interface NowPlaying {
  title: string
  artists: string
  album: string
  /** Gambar dari API (bisa kosong atau gagal; CoverArt jatuh ke gradient `cover`). */
  coverSrc: string | undefined
  cover: Cover
  /** Hanya URL open.spotify.com/track/... yang valid; undefined = sembunyikan tombol. */
  spotifyUrl: string | undefined
}

/** Metadata lagu aktif yang dipakai MiniPlayer dan FullPlayer (diturunkan dari state pemutar yang sama). */
export function useNowPlaying(): NowPlaying | null {
  const { currentTrack, playbackInfo } = useAudioPlayer()
  return useMemo(() => {
    if (!currentTrack) return null
    return {
      title: currentTrack.title,
      artists: currentTrack.artists || playbackInfo?.artist || '',
      album: currentTrack.album,
      coverSrc: currentTrack.cover || playbackInfo?.cover || undefined,
      cover: fallbackCover(`${currentTrack.title}${currentTrack.album}`),
      spotifyUrl: resolveSpotifyTrackUrl(currentTrack.url, playbackInfo?.spotifyUrl),
    }
  }, [currentTrack, playbackInfo])
}
