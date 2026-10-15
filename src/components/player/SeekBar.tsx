import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useAudioPlayer, usePlaybackTime } from '../../hooks/useAudioPlayer'
import { formatTime, parseDuration } from '../../utils/formatTime'

interface SeekBarProps {
  /** Ukuran jejak progres: mini lebih tipis. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Progress bar + waktu berjalan + durasi. Membaca langsung `currentTime` dari audio
 * engine (lewat usePlaybackTime), tidak menyimpan waktu sendiri selain nilai sementara
 * saat pengguna menyeret slider.
 *
 * Bisa digeser HANYA bila audio melaporkan `seekable` dan statusnya playing/buffering/paused.
 * Selain itu yang tampil hanya bar progres biasa (role=progressbar), tanpa kontrol.
 */
export default function SeekBar({ size = 'md', className = '' }: SeekBarProps) {
  const { currentTime, duration: engineDuration, seekable } = usePlaybackTime()
  const { status, currentTrack, playbackInfo, seekTo } = useAudioPlayer()
  // Stream tanpa Content-Length membuat elemen audio melaporkan durasi tak terhingga (null di sini).
  // Cadangan: durasi dari metadata lagu, hanya untuk tampilan progres. Seek tetap butuh `seekable`.
  const duration = engineDuration ?? parseDuration(playbackInfo?.duration) ?? parseDuration(currentTrack?.duration)
  const labelId = useId()
  const [dragValue, setDragValue] = useState<number | null>(null)
  // Posisi tujuan setelah dilepas: ditahan di layar sampai audio benar-benar pindah, supaya bar tidak
  // sempat melompat balik ke posisi lama.
  const [held, setHeld] = useState<number | null>(null)
  // Nilai seret terbaru (state bisa basi di handler yang dipanggil berurutan: pointerup lalu mouseup/touchend).
  const dragRef = useRef<number | null>(null)

  const updateDrag = useCallback((value: number | null) => {
    dragRef.current = value
    setDragValue(value)
  }, [])

  // Ganti lagu atau seek tidak lagi diizinkan: buang nilai seret yang tertinggal.
  const trackId = currentTrack?.id
  useEffect(() => {
    updateDrag(null)
    setHeld(null)
  }, [trackId, updateDrag])

  const statusAllowsSeek = status === 'playing' || status === 'buffering' || status === 'paused'
  const canSeek = seekable && statusAllowsSeek && duration !== null && duration > 0
  const maxValue = duration ?? 0
  useEffect(() => {
    if (!canSeek) {
      updateDrag(null)
      setHeld(null)
    }
  }, [canSeek, updateDrag])

  // Lepas tahanan begitu posisi audio sudah dekat tujuan, atau setelah 1,5 detik (seek ditolak/dijepit).
  useEffect(() => {
    if (held === null) return
    if (Math.abs(currentTime - held) < 1.5) {
      setHeld(null)
      return
    }
    const timer = window.setTimeout(() => setHeld(null), 1500)
    return () => window.clearTimeout(timer)
  }, [held, currentTime])

  const shown = dragValue ?? held ?? currentTime
  const percent = duration && duration > 0 ? Math.min(100, Math.max(0, (shown / duration) * 100)) : 0
  const trackHeight = size === 'sm' ? 'h-1' : 'h-1.5'

  const commit = () => {
    const target = dragRef.current
    if (target === null) return
    updateDrag(null) // pointerup + mouseup/touchend bisa datang berurutan: hanya yang pertama yang menggeser
    setHeld(target)
    seekTo(target)
  }

  // Audio sudah berjalan tetapi browser tidak mengizinkan geser posisi (biasanya server audio tanpa dukungan Range).
  const seekBlocked = statusAllowsSeek && !canSeek && duration !== null && duration > 0

  const timeText = `${formatTime(currentTime)} dari ${duration ? formatTime(duration) : 'durasi belum diketahui'}`

  return (
    <div className={`flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-ink-muted ${className}`}>
      <span className="w-10 shrink-0 text-right" aria-hidden="true">
        {formatTime(duration ? Math.min(shown, duration) : shown)}
      </span>

      <div className={`group relative flex flex-1 items-center ${size === 'sm' ? '-my-1.5 h-8' : 'h-10'}`}>
        <div
          className={`${trackHeight} w-full overflow-hidden rounded-full bg-raised group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-accent`}
        >
          <div className="h-full rounded-full bg-ink group-focus-within:bg-accent group-hover:bg-accent" style={{ width: `${percent}%` }} />
        </div>

        {/* Pegangan terlihat: selalu di pemutar penuh (sentuh), saat hover/fokus di mini player. */}
        {canSeek && (
          <span
            aria-hidden="true"
            style={{ left: `${percent}%` }}
            className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${
              size === 'sm' ? 'opacity-0 [@media(hover:none)]:opacity-100' : 'opacity-100'
            }`}
          />
        )}

        {canSeek ? (
          <>
            <span id={labelId} className="sr-only">
              Posisi lagu
            </span>
            <input
              type="range"
              aria-labelledby={labelId}
              aria-valuetext={timeText}
              min={0}
              max={maxValue}
              step={0.25}
              value={shown}
              onChange={(e) => updateDrag(Number(e.target.value))}
              onPointerUp={commit}
              onPointerCancel={commit}
              onTouchEnd={commit}
              onMouseUp={commit}
              onKeyUp={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) commit()
              }}
              onBlur={commit}
              className="absolute inset-0 h-full w-full cursor-pointer touch-none opacity-0 focus-visible:outline-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
            />
          </>
        ) : (
          <div
            role="progressbar"
            aria-label="Posisi lagu"
            aria-valuemin={0}
            aria-valuemax={duration ?? undefined}
            aria-valuenow={duration ? Math.min(currentTime, duration) : undefined}
            aria-valuetext={timeText}
            className="absolute inset-0"
          />
        )}
      </div>

      <span className="w-10 shrink-0" aria-hidden="true">
        {duration ? formatTime(duration) : '--:--'}
      </span>

      {seekBlocked && size === 'md' && (
        <p role="status" className="basis-full text-center text-[11px] text-ink-faint">
          Posisi belum bisa digeser: sumber audio ini tidak mendukung seek.
        </p>
      )}
    </div>
  )
}
