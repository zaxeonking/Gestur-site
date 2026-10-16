import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** Lama menahan sebelum menu muncul, dan jarak geser yang masih dianggap "diam". */
export const LONG_PRESS_MS = 450
export const LONG_PRESS_SLOP_PX = 10

/**
 * Tahan lama (sentuh) atau klik kanan (desktop) pada sebuah elemen memanggil `onLongPress`.
 * Setelah menu terbuka, klik/ketukan yang menyusul saat jari dilepas ditelan, jadi lagu tidak ikut
 * terputar. Taruh `handlers` langsung di elemen baris (mis. `<li {...handlers}>`).
 * Menggeser jari lebih dari 10px (menggulir) membatalkan tahan lama.
 */
export function useLongPress(onLongPress: () => void) {
  const callbackRef = useRef(onLongPress)
  useEffect(() => {
    callbackRef.current = onLongPress
  }, [onLongPress])

  const timerRef = useRef<number | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const firedRef = useRef(false)
  const swallowUntilRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])
  useEffect(() => clearTimer, [clearTimer])

  const fire = useCallback(() => {
    firedRef.current = true
    timerRef.current = null
    navigator.vibrate?.(15)
    callbackRef.current()
  }, [])

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // Klik kanan mouse ditangani onContextMenu.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      firedRef.current = false
      swallowUntilRef.current = 0
      startRef.current = { x: event.clientX, y: event.clientY }
      clearTimer()
      timerRef.current = window.setTimeout(fire, LONG_PRESS_MS)
    },
    [clearTimer, fire],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (timerRef.current === null) return
      if (Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y) > LONG_PRESS_SLOP_PX) {
        clearTimer()
      }
    },
    [clearTimer],
  )

  const onPointerUp = useCallback(() => {
    clearTimer()
    // Klik yang menyusul pelepasan jari setelah menu terbuka tidak boleh memutar lagu.
    if (firedRef.current) swallowUntilRef.current = Date.now() + 500
  }, [clearTimer])

  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // Klik kanan (desktop) dan tahan lama bawaan WebView: pakai menu kita, bukan menu browser.
      event.preventDefault()
      clearTimer()
      if (!firedRef.current) fire()
    },
    [clearTimer, fire],
  )

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (Date.now() < swallowUntilRef.current) {
      swallowUntilRef.current = 0
      event.preventDefault()
      event.stopPropagation()
    }
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: clearTimer,
    onPointerLeave: clearTimer,
    onContextMenu,
    onClickCapture,
  }
}
