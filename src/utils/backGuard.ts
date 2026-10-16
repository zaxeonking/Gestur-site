import type { createBrowserRouter } from 'react-router-dom'

type DataRouter = ReturnType<typeof createBrowserRouter>

const HOME = '/'
/** Penanda pada entri "/" hasil menekan ikon Beranda (bukan entri "/" awal). */
const DUP = '__musicverseHomeDup'

function newState(idx: number) {
  return { usr: null, key: Math.random().toString(36).slice(2, 10), idx }
}

const isDupEntry = () => Boolean(window.history.state?.usr?.[DUP])

/**
 * Jalankan SEBELUM createBrowserRouter.
 * Kalau web dibuka langsung di halaman selain "/" (mis. /library dari bookmark),
 * riwayat dibuat jadi [ "/", halaman itu ] supaya Back dari halaman itu pasti ke link utama dulu.
 */
export function prepareHistory(): void {
  const { pathname, search, hash } = window.location
  if (pathname === HOME) return
  if (typeof window.history.state?.idx === 'number') return // sudah ada riwayat app (mis. refresh)
  window.history.replaceState(newState(0), '', HOME)
  window.history.pushState(newState(1), '', pathname + search + hash)
}

/**
 * Aturan Back:
 *  - Di "/" : Back langsung keluar (tidak ke halaman lain di app, tidak ke "/" lagi).
 *  - Di halaman lain: Back ke "/" dulu, Back lagi baru keluar.
 *
 * Riwayat dijaga selalu berbentuk [ "/", satu-entri-aktif ]:
 *  - "/" -> halaman lain            : entri baru (push), kecuali entri "/" itu sendiri hasil ikon Beranda (replace)
 *  - halaman lain -> halaman lain   : replace
 *  - halaman lain -> "/" (ikon Beranda): replace entri itu jadi "/" bertanda DUP.
 *    Kalau dari situ Back ditekan, app mendarat di "/" awal lalu otomatis Back sekali lagi => keluar.
 *    Jadi urutan Beranda > Koleksi > ikon Beranda > Back = keluar, bukan Beranda lagi.
 */
export function installBackGuard(router: DataRouter): void {
  const original = router.navigate.bind(router)

  const guarded = (to: unknown, opts?: Record<string, unknown>) => {
    // navigate(-1) dan sejenisnya (penutup overlay) dibiarkan apa adanya.
    if (typeof to === 'number') return original(to)

    const here = router.state.location.pathname
    const target =
      typeof to === 'string' ? to.split(/[?#]/)[0] : ((to as { pathname?: string })?.pathname ?? here)

    // Halaman yang sama (mis. overlay pemutar/antrean yang menambah entri): jangan diutak-atik.
    if (target === here) return original(to as never, opts as never)

    // Menuju Beranda dari halaman lain: pindah langsung, tanpa menambah entri riwayat.
    if (target === HOME) {
      const state = { ...(opts?.state as object | undefined), [DUP]: true }
      return original(to as never, { ...opts, replace: true, state } as never)
    }

    // Dari halaman lain ke halaman lain, atau dari "/" bekas ikon Beranda: ganti entri, jangan menumpuk.
    if (here !== HOME || isDupEntry()) return original(to as never, { ...opts, replace: true } as never)

    // Dari "/" awal ke halaman lain: satu entri baru.
    return original(to as never, opts as never)
  }

  router.navigate = guarded as DataRouter['navigate']

  let lastPath = window.location.pathname
  let lastIdx: number = window.history.state?.idx ?? 0
  let lastDup = isDupEntry()

  window.addEventListener('popstate', () => {
    const path = window.location.pathname
    const idx: number = window.history.state?.idx ?? 0
    const wentBack = idx < lastIdx
    const pageChanged = path !== lastPath
    const leftDup = wentBack && lastDup
    lastPath = path
    lastIdx = idx
    lastDup = isDupEntry()

    // Back dari "/" bekas ikon Beranda mendarat di "/" awal: mundur sekali lagi = keluar.
    if (leftDup && path === HOME) {
      window.history.back()
      return
    }
    // Back mendarat di halaman lain selain "/" (riwayat lama yang menumpuk): lompat ke entri "/" paling bawah.
    if (wentBack && pageChanged && path !== HOME && idx > 0) window.history.go(-idx)
  })

  router.subscribe((state) => {
    lastPath = state.location.pathname
    lastIdx = window.history.state?.idx ?? 0
    lastDup = isDupEntry()
  })
}
