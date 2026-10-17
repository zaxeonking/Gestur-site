import { useEffect, useRef } from 'react'
import { usePlaybackTime, usePlayerActions, useAudioPlayer } from '../../hooks/useAudioPlayer'
import { composeNotificationCover } from '../../utils/notificationCover'
import { fallbackCover } from '../../utils/fallbackCover'
import { stripArtistPrefix } from '../../utils/trackTitle'

/** Ikon app (PNG dari favicon): sampul sementara selagi sampul lagu + badge logo dibuat, dan cadangan jika gagal. */
const ARTWORK_SIZES = [192, 512] as const
/** Loncat maju/mundur dari tombol notifikasi (detik). */
const SKIP_S = 10
/** Selisih (detik) antara posisi yang diperkirakan sistem dan posisi sebenarnya sebelum dilaporkan ulang. */
const DRIFT_S = 1.5

function fallbackArtwork(): MediaImage[] {
  return ARTWORK_SIZES.map((size) => ({
    src: new URL(`icons/icon-${size}.png`, document.baseURI).href,
    sizes: `${size}x${size}`,
    type: 'image/png',
  }))
}

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    // Aksi ini tidak didukung browser: abaikan.
  }
}

/**
 * Menyambungkan pemutar ke Media Session: notifikasi media dan layar kunci menampilkan JUDUL LAGU di baris
 * atas (artis di bawahnya) dengan sampul lagu + lingkaran kecil logo MusicVerse di pojok kanan bawah. Tombol play/jeda, sebelumnya,
 * berikutnya, dan bilah posisi di notifikasi mengendalikan pemutar. Tidak merender apa pun.
 */
export default function MediaSessionSync() {
  const { status, currentTrack, hasNext, hasPrevious } = useAudioPlayer()
  const actions = usePlayerActions()
  const { currentTime, duration, seekable } = usePlaybackTime()
  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator

  // Salinan terbaru untuk handler yang didaftarkan sekali.
  const latest = useRef({ status, actions, currentTime, duration })
  useEffect(() => {
    latest.current = { status, actions, currentTime, duration }
  })

  const trackId = currentTrack?.id ?? null
  const artists = currentTrack?.artists ?? ''
  const title = stripArtistPrefix(currentTrack?.title ?? '', artists)
  const album = currentTrack?.album ?? ''
  const coverUrl = currentTrack?.cover || undefined

  // Judul lagu di atas, artis di bawahnya. Sampul: ikon app dulu, lalu diganti sampul lagu + badge logo.
  useEffect(() => {
    if (!supported) return
    if (trackId === null) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: artists, album, artwork: fallbackArtwork() })

    let cancelled = false
    let blobUrl: string | null = null
    composeNotificationCover(coverUrl, fallbackCover(`${title}${album}`))
      .then((url) => {
        if (!url) return
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        blobUrl = url
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist: artists,
          album,
          artwork: [{ src: url, sizes: '512x512', type: 'image/png' }],
        })
      })
      .catch(() => {
        // Tetap pakai ikon app.
      })
    return () => {
      cancelled = true
      // Blob dilepas belakangan: notifikasi mungkin masih memuatnya sesaat setelah metadata berganti.
      if (blobUrl) {
        const stale = blobUrl
        setTimeout(() => URL.revokeObjectURL(stale), 10000)
      }
    }
  }, [supported, trackId, title, artists, album, coverUrl])

  useEffect(() => {
    if (!supported) return
    if (trackId === null) navigator.mediaSession.playbackState = 'none'
    else {
      const playing = status === 'playing' || status === 'buffering' || status === 'loading' || status === 'resolving'
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }
  }, [supported, trackId, status])

  // Tombol notifikasi. Aksi yang tidak mungkin (tidak ada lagu berikutnya, audio tidak bisa di-seek) dilepas
  // supaya tombolnya tidak tampil.
  useEffect(() => {
    if (!supported) return
    const call = latest
    setHandler('play', () => {
      const { status: s, actions: a } = call.current
      if (s === 'paused' || s === 'ended' || s === 'error') a.togglePlayPause()
    })
    setHandler('pause', () => call.current.actions.pause())
    setHandler('stop', () => call.current.actions.pause())
    setHandler('previoustrack', hasPrevious ? () => call.current.actions.playPrevious() : null)
    setHandler('nexttrack', hasNext ? () => call.current.actions.playNext() : null)
    setHandler('seekto', seekable ? (d) => d.seekTime !== undefined && call.current.actions.seekTo(d.seekTime) : null)
    setHandler('seekbackward', seekable ? () => call.current.actions.seekTo(Math.max(0, call.current.currentTime - SKIP_S)) : null)
    setHandler('seekforward', seekable ? () => call.current.actions.seekTo(call.current.currentTime + SKIP_S) : null)
    return () => {
      for (const action of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'] as const) {
        setHandler(action, null)
      }
    }
  }, [supported, hasNext, hasPrevious, seekable])

  // Posisi: dilaporkan saat berubah berarti (seek, lagu baru, durasi baru); di antaranya sistem memperkirakan sendiri.
  const reported = useRef<{ position: number; at: number; duration: number; playing: boolean } | null>(null)
  useEffect(() => {
    if (!supported || trackId === null || duration === null || !(duration > 0) || !Number.isFinite(duration)) return
    const playing = status === 'playing'
    const now = performance.now()
    const last = reported.current
    const expected = last ? last.position + (last.playing ? (now - last.at) / 1000 : 0) : null
    const stale =
      last === null ||
      last.duration !== duration ||
      last.playing !== playing ||
      expected === null ||
      Math.abs(expected - currentTime) > DRIFT_S
    if (!stale) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(0, currentTime), duration),
        playbackRate: 1,
      })
      reported.current = { position: currentTime, at: now, duration, playing }
    } catch {
      // Nilai tidak valid untuk browser ini: abaikan.
    }
  }, [supported, trackId, status, currentTime, duration])

  return null
}
