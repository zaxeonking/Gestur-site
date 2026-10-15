import { useEffect, useRef } from 'react'

const MARK = '__musicverseOverlay'
/** Overlay yang sedang terbuka, urut dari yang terbawah. Hanya yang paling atas menanggapi tombol Back. */
const stack: string[] = []
let seq = 0

/**
 * Menjadikan overlay (pemutar penuh, antrean, menu) bagian dari riwayat browser:
 * - Saat terbuka, satu entri riwayat (URL yang sama) ditambahkan.
 * - Tombol/gestur Back (termasuk Back di Android) hanya menutup overlay paling atas;
 *   halaman di belakangnya tidak ikut mundur.
 * - Jika overlay ditutup lewat UI (tombol tutup), entri itu dibuang lagi agar riwayat tetap bersih.
 *
 * `open` harus true selama overlay tampil. Komponen yang dirender bersyarat cukup memanggil `useOverlayHistory(true, onClose)`.
 */
export function useOverlayHistory(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const token = `overlay-${++seq}`
    let pushed = false

    // Ditunda satu tick: efek yang langsung dibersihkan dan dijalankan lagi (StrictMode) tidak meninggalkan entri.
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), [MARK]: token }, '')
      stack.push(token)
      pushed = true
    }, 0)

    const onPop = () => {
      if (!pushed || stack[stack.length - 1] !== token) return
      // Masih berada di entri milik kita (mis. maju dari bawah): bukan Back yang menutup overlay.
      if (window.history.state?.[MARK] === token) return
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      const at = stack.indexOf(token)
      if (at !== -1) stack.splice(at, 1)
      // Ditutup lewat UI (bukan Back): entri kita masih di puncak riwayat, buang.
      if (pushed && window.history.state?.[MARK] === token) window.history.back()
    }
  }, [open])
}
