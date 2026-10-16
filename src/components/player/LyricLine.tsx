import { Music2 } from 'lucide-react'
import { useMemo } from 'react'
import { usePlaybackTime } from '../../hooks/useAudioPlayer'
import { estimateActive, useLyricTiming } from '../../hooks/useLyricTiming'
import { useLyrics } from '../../hooks/useLyrics'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import type { LyricsResult } from '../../services/lyricsApi'
import { looksLikeSameTrack } from '../../utils/playerStatus'

/** Satu baris di strip lirik. WAJIB satu baris: tidak membungkus, kepanjangan dipotong dengan elipsis. */
function Strip({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <div aria-live="off" className="flex h-9 items-center gap-2 overflow-hidden px-4">
      <Music2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <p className={`min-w-0 flex-1 truncate whitespace-nowrap text-center text-sm ${dim ? 'text-ink-muted' : 'font-medium text-ink'}`}>{text}</p>
    </div>
  )
}

function SyncedLine({ result, trackKey }: { result: Extract<LyricsResult, { kind: 'synced' }>; trackKey: string }) {
  const { items, active } = useLyricTiming(result, trackKey)
  const text = active >= 0 ? items[active]?.text.trim() : ''
  return <Strip text={text || '♪'} dim={!text} />
}

function PlainLine({ lines }: { lines: string[] }) {
  const { currentTime, duration } = usePlaybackTime()
  const items = useMemo(() => lines.map((text) => ({ text })), [lines])
  const active = estimateActive(items, currentTime, duration)
  const text = active >= 0 ? items[active]?.text.trim() : ''
  return <Strip text={text || '♪'} dim={!text} />
}

/**
 * Strip lirik berjalan di bagian atas kartu mini player (menyatu dengan kartu, latar solid).
 * Mengambil lirik sendiri lewat useLyrics (cache dipakai bersama pemutar penuh) dan memakai
 * logika waktu yang sama dengan pemutar penuh, jadi baris yang tampil selalu sama.
 */
export default function LyricLine() {
  const { currentTrack, playbackInfo } = useAudioPlayer()
  // Lirik dicari untuk lagu yang BENAR-BENAR terdengar (sama seperti pemutar penuh).
  const track = useMemo(() => {
    if (!currentTrack) return null
    if (playbackInfo && !looksLikeSameTrack(currentTrack, playbackInfo)) {
      return { ...currentTrack, title: playbackInfo.title, artists: playbackInfo.artist, album: playbackInfo.album, duration: playbackInfo.duration }
    }
    return currentTrack
  }, [currentTrack, playbackInfo])
  const { state } = useLyrics(track, track !== null)

  if (!currentTrack) return null
  if (state.status === 'idle' || state.status === 'loading') return <Strip text="Mencari lirik…" dim />
  if (state.status === 'error') return <Strip text="Lirik gagal dimuat" dim />
  const { result } = state
  if (result.kind === 'none') return <Strip text="Lirik tidak ditemukan" dim />
  if (result.kind === 'instrumental') return <Strip text="Instrumental" dim />
  if (result.kind === 'plain') return <PlainLine lines={result.lines} />
  return <SyncedLine result={result} trackKey={`${currentTrack.title}|${currentTrack.artists}`} />
}
