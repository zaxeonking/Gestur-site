import { Moon, Music2, TimerOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSleepTimer } from '../../context/SleepTimerContext'
import { useOverlayHistory } from '../../hooks/useOverlayHistory'
import { formatTime } from '../../utils/formatTime'
import Action from './SheetAction'

const OPTIONS_MINUTES = [15, 30, 45, 60] as const
/** Batas menit untuk timer buatan sendiri (12 jam). */
const CUSTOM_MIN = 1
const CUSTOM_MAX = 720
const FOCUSABLE = 'button:not([disabled]), input:not([disabled])'

/** Sisa waktu (detik) menuju `endsAt`, diperbarui tiap detik. null jika tidak ada timer menit. */
export function useRemainingSeconds(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (endsAt === null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [endsAt])
  return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/** Tombol pil di pemutar penuh; menampilkan sisa waktu saat timer menyala. */
export function SleepTimerButton({ onClick }: { onClick: () => void }) {
  const { endsAt, atTrackEnd, active } = useSleepTimer()
  const remaining = useRemainingSeconds(endsAt)
  const label = remaining !== null ? formatTime(remaining) : atTrackEnd ? 'Akhir lagu' : 'Timer'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={active ? `Sleep timer aktif: ${label}` : 'Atur sleep timer'}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold tabular-nums transition-colors active:bg-white/10 focus-ring ${
        active ? 'border-accent text-accent' : 'border-white/20 text-ink hover:border-accent'
      }`}
    >
      <Moon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}

/**
 * Menu bawah untuk memilih sleep timer. Dirender lewat portal ke <body> agar tidak ikut terpengaruh
 * transformasi/animasi pemutar penuh.
 */
export default function SleepTimerSheet({ onClose }: { onClose: () => void }) {
  const { endsAt, atTrackEnd, active, startMinutes, startAtTrackEnd, cancel } = useSleepTimer()
  const remaining = useRemainingSeconds(endsAt)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  useOverlayHistory(true, onClose)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sheetRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    return () => previous?.focus?.()
  }, [])

  const choose = (action: () => void) => {
    action()
    onClose()
  }

  const submitCustom = (event: FormEvent) => {
    event.preventDefault()
    const minutes = Number(custom.trim())
    if (custom.trim() === '' || !Number.isInteger(minutes) || minutes < CUSTOM_MIN || minutes > CUSTOM_MAX) {
      setCustomError(`Isi menit bulat ${CUSTOM_MIN}–${CUSTOM_MAX}.`)
      return
    }
    choose(() => startMinutes(minutes))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Portal tetap meneruskan event ke induk React (pemutar penuh): hentikan agar Tab/Esc tidak ditangani dua kali.
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
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

  const status =
    remaining !== null
      ? `Volume mengecil pelan, musik dijeda dalam ${formatTime(remaining)}`
      : atTrackEnd
        ? 'Volume mengecil di akhir lagu, lalu musik berhenti'
        : 'Musik berhenti sendiri setelah waktu yang kamu pilih'

  return createPortal(
    <div className="fixed inset-0 z-[70]" onKeyDown={onKeyDown}>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sleep timer"
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md animate-sheet-up rounded-t-2xl border-t border-line bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl shadow-black/60 lg:bottom-6 lg:rounded-2xl lg:border"
      >
        <div className="px-4 pb-3 pt-4">
          <p className="text-sm font-semibold text-ink">Sleep timer</p>
          <p role="status" className="mt-0.5 text-xs text-ink-muted">
            {status}
          </p>
        </div>
        <ul className="border-t border-line px-2 pt-2">
          {OPTIONS_MINUTES.map((minutes) => (
            <Action key={minutes} icon={Moon} label={`${minutes} menit`} onClick={() => choose(() => startMinutes(minutes))} />
          ))}
          <li className="px-3 py-1.5">
            <form onSubmit={submitCustom} noValidate className="flex items-center gap-3">
              <Moon className="h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
              <label htmlFor="sleep-custom" className="sr-only">
                Menit sendiri
              </label>
              <input
                id="sleep-custom"
                type="number"
                inputMode="numeric"
                min={CUSTOM_MIN}
                max={CUSTOM_MAX}
                step={1}
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value)
                  setCustomError(null)
                }}
                placeholder="Menit sendiri, mis. 20 atau 90"
                aria-invalid={customError !== null}
                aria-describedby={customError ? 'sleep-custom-error' : undefined}
                className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button type="submit" className="btn-primary h-11 shrink-0 px-5 text-sm">
                Mulai
              </button>
            </form>
            {customError && (
              <p id="sleep-custom-error" role="alert" className="mt-1 pl-8 text-xs text-danger">
                {customError}
              </p>
            )}
          </li>
          <Action
            icon={Music2}
            label="Setelah lagu ini selesai"
            hint="Berhenti di akhir lagu yang sedang diputar"
            onClick={() => choose(startAtTrackEnd)}
          />
          {active && <Action icon={TimerOff} label="Matikan timer" onClick={() => choose(cancel)} danger />}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
