import { useEffect, useMemo, useState } from 'react'
import { usePlaybackTime } from './useAudioPlayer'
import type { LyricsResult, SyncedVersion } from '../services/lyricsApi'
import { findActiveLine } from '../utils/lrc'
import { readJson } from '../utils/safeStorage'

/** Layar memutakhirkan waktu ±4x/detik; baris disorot sedikit lebih awal agar terasa pas dengan suara. */
export const LEAD_S = 0.3
/** Selisih durasi (detik) lirik vs audio: sampai batas ini waktu lirik dipakai apa adanya. */
export const TIMING_EXACT_S = 15
export const SCALE_MIN = 0.8
export const SCALE_MAX = 1.25

export type TimingMode = 'exact' | 'scaled' | 'estimated'

export interface LyricItem {
  text: string
  /** Detik pada versi lirik; ada hanya untuk mode berwaktu. */
  time?: number
}

/** Baris aktif menurut PROGRES lagu (tanpa waktu per baris). Hanya perkiraan, tetapi tetap bergerak. */
export function estimateActive(items: readonly LyricItem[], currentTime: number, duration: number | null): number {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return -1
  const filled = items.map((item, i) => (item.text.trim() ? i : -1)).filter((i) => i >= 0)
  if (filled.length === 0) return -1
  const progress = Math.min(1, Math.max(0, (currentTime / duration - 0.06) / 0.86))
  return filled[Math.min(filled.length - 1, Math.floor(progress * filled.length))]
}

export function offsetStorageKey(trackKey?: string): string | null {
  return trackKey ? `musicverse:lyricsOffset:${trackKey.toLowerCase()}` : null
}

/**
 * Logika waktu lirik berwaktu yang dipakai bersama LyricsPanel (pemutar penuh) dan mini player:
 * memilih versi yang durasinya paling dekat dengan audio, mode exact/scaled/estimated, dan
 * penyelarasan manual per lagu. Sorotan di kedua tempat selalu sama.
 */
export function useLyricTiming(result: Extract<LyricsResult, { kind: 'synced' }>, trackKey?: string) {
  const primary = useMemo<SyncedVersion>(() => ({ lines: result.lines, duration: result.duration }), [result])
  const alternatives = result.alternatives
  const { currentTime, seekable, duration: audioDuration } = usePlaybackTime()

  // Pilih versi SATU KALI saat durasi audio diketahui, lalu kunci (ganti versi di tengah lagu membuat lirik loncat).
  const [picked, setPicked] = useState<SyncedVersion | null>(null)
  useEffect(() => setPicked(null), [primary])
  useEffect(() => {
    if (picked !== null || alternatives.length === 0) return
    if (audioDuration === null || !Number.isFinite(audioDuration) || audioDuration <= 0) return
    const gap = (v: SyncedVersion) => (v.duration === null ? Infinity : Math.abs(v.duration - audioDuration))
    const best = alternatives.reduce((a, b) => (gap(b) < gap(a) ? b : a))
    setPicked(gap(best) <= gap(primary) - 2 ? best : primary)
  }, [picked, primary, alternatives, audioDuration])
  const { lines, duration: lyricsDuration } = picked ?? primary

  const items = useMemo<LyricItem[]>(() => lines.map((line) => ({ text: line.text, time: line.time })), [lines])

  // Penyelarasan manual (detik): positif = lirik maju. Disimpan per lagu.
  const storageKey = offsetStorageKey(trackKey)
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!storageKey) return setOffset(0)
    const saved = readJson(storageKey)
    setOffset(saved.status === 'ok' && typeof saved.value === 'number' && Number.isFinite(saved.value) ? saved.value : 0)
  }, [storageKey])

  const known = audioDuration !== null && lyricsDuration !== null && Number.isFinite(audioDuration) && audioDuration > 0
  const diff = known ? Math.abs(lyricsDuration - audioDuration) : 0
  const ratio = known ? audioDuration / lyricsDuration : 1
  const mode: TimingMode = !known || diff <= TIMING_EXACT_S ? 'exact' : ratio >= SCALE_MIN && ratio <= SCALE_MAX ? 'scaled' : 'estimated'
  const lyricTime = mode === 'scaled' ? currentTime / ratio : currentTime

  const active = useMemo(
    () => (mode === 'estimated' ? estimateActive(items, currentTime, audioDuration) : findActiveLine(lines, lyricTime + offset + LEAD_S)),
    [mode, items, lines, currentTime, lyricTime, offset, audioDuration],
  )

  return { items, active, mode, offset, setOffset, ratio, lyricTime, lyricsDuration, audioDuration, seekable, storageKey }
}
