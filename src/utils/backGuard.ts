import type { createBrowserRouter } from 'react-router-dom'

type DataRouter = ReturnType<typeof createBrowserRouter>

const HOME = '/'

function newState(idx: number) {
  return { usr: null, key: Math.random().toString(36).slice(2, 10), idx }
}

/**
 * Jalankan SEBELUM createBrowserRouter.
 * Kalau web dibuka langsung di halaman selain "/" (mis. /library dari bookmark/refresh pertama),
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
 *  - Di "/" (link utama): Back langsung keluar, tidak ke halaman lain di app.
 *  - Di halaman lain: Back ke "/" dulu, Back lagi baru keluar.
 *
 * Caranya menjaga riwayat selalu berbentuk [ "/", halaman-aktif ]:
 *  - pindah halaman selain "/" -> "/" pakai replace (tidak menumpuk riwayat)
 *  - menuju "/" dari halaman lain -> mundur ke entri "/" yang sudah ada (bukan menambah entri baru)
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

    if (target === HOME) {
      const idx = window.history.state?.idx
      const goHomeDirect = () => original(to as never, { ...opts, replace: true } as never)
      if (typeof idx === 'number' && idx > 0) {
        original(-idx)
        // Jaring pengaman: kalau mundur ternyata tidak mendarat di "/", paksa pindah langsung
        // supaya tombol Beranda tidak pernah terasa mati.
        return new Promise<void>((resolve) => {
          window.setTimeout(() => {
            if (window.location.pathname !== HOME) void goHomeDirect()
            resolve()
          }, 400)
        })
      }
      return goHomeDirect()
    }

    if (here !== HOME) return original(to as never, { ...opts, replace: true } as never)
    return original(to as never, opts as never)
  }

  router.navigate = guarded as DataRouter['navigate']

  // Pengaman kedua (tidak bergantung pada router): kalau Back mendarat di halaman lain
  // selain "/", langsung lompat ke entri "/" (entri paling bawah, idx 0).
  // Ini juga menangani riwayat lama yang sudah terlanjur menumpuk (search -> library -> utama ...).
  let lastPath = window.location.pathname
  let lastIdx: number = window.history.state?.idx ?? 0

  window.addEventListener('popstate', () => {
    const path = window.location.pathname
    const idx: number = window.history.state?.idx ?? 0
    const wentBack = idx < lastIdx
    const pageChanged = path !== lastPath
    lastPath = path
    lastIdx = idx
    // Back biasa (bukan penutup overlay: overlay tetap di halaman yang sama).
    if (wentBack && pageChanged && path !== HOME && idx > 0) window.history.go(-idx)
  })

  router.subscribe((state) => {
    lastPath = state.location.pathname
    lastIdx = window.history.state?.idx ?? 0
  })
}
