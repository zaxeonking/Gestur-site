import { Check, VolumeX, Waves } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CROSSFADE_OPTIONS_S } from '../../hooks/useAudioPlayerController'
import { useAudioPlayer, usePlayerActions } from '../../hooks/useAudioPlayer'
import { useOverlayHistory } from '../../hooks/useOverlayHistory'
import Action from './SheetAction'

const optionLabel = (seconds: number) => (seconds === 0 ? 'Mati' : `${seconds} detik`)

/** Tombol pil di pemutar penuh; menampilkan lama crossfade saat menyala. Tersembunyi jika perangkat tidak mendukung. */
export function CrossfadeButton({ onClick }: { onClick: () => void }) {
  const { crossfadeSeconds, crossfadeSupported } = useAudioPlayer()
  if (!crossfadeSupported) return null
  const active = crossfadeSeconds > 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={active ? `Crossfade ${crossfadeSeconds} detik` : 'Atur crossfade'}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold tabular-nums transition-colors active:bg-white/10 focus-ring ${
        active ? 'border-accent text-accent' : 'border-white/20 text-ink hover:border-accent'
      }`}
    >
      <Waves className="h-4 w-4" aria-hidden="true" />
      {active ? `${crossfadeSeconds}s` : 'Crossfade'}
    </button>
  )
}

/** Menu bawah untuk memilih lama crossfade antar lagu. Portal ke <body>, pola sama dengan SleepTimerSheet. */
export default function CrossfadeSheet({ onClose }: { onClose: () => void }) {
  const { crossfadeSeconds } = useAudioPlayer()
  const { setCrossfade } = usePlayerActions()
  const sheetRef = useRef<HTMLDivElement>(null)
  useOverlayHistory(true, onClose)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sheetRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" onKeyDown={onKeyDown}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Crossfade"
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md animate-sheet-up rounded-t-2xl border-t border-line bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl shadow-black/60 lg:bottom-6 lg:rounded-2xl lg:border"
      >
        <div className="px-4 pb-3 pt-4">
          <p className="text-sm font-semibold text-ink">Crossfade</p>
          <p role="status" className="mt-0.5 text-xs text-ink-muted">
            {crossfadeSeconds > 0
              ? `Lagu berikutnya masuk halus selama ${crossfadeSeconds} detik, tanpa jeda`
              : 'Mati: lagu berpindah setelah lagu sebelumnya selesai'}
          </p>
        </div>
        <ul className="border-t border-line px-2 pt-2">
          {CROSSFADE_OPTIONS_S.map((seconds) => (
            <Action
              key={seconds}
              icon={seconds === crossfadeSeconds ? Check : seconds === 0 ? VolumeX : Waves}
              label={optionLabel(seconds)}
              onClick={() => {
                setCrossfade(seconds)
                onClose()
              }}
            />
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
