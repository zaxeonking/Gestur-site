import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import PlayerDock from '../player/PlayerDock'
import BottomNav from './BottomNav'
import MobileHeader from './MobileHeader'
import Sidebar from './Sidebar'

/**
 * Kerangka layar penuh yang terkunci ke viewport (fixed inset-0) dan disusun sebagai kolom flex:
 *   header -> konten (satu-satunya area scroll) -> mini player -> bottom nav.
 * Mini player dan bottom nav adalah anak flex biasa (bukan position: fixed), jadi mereka selalu
 * menempati ruangnya sendiri di bawah: konten tidak pernah tertutup, dan keduanya tidak ikut
 * bergeser saat toolbar browser muncul/hilang. Semua bagian otomatis punya lebar yang sama.
 */
export default function AppShell() {
  const { pathname } = useLocation()
  const { status, currentTrack } = useAudioPlayer()
  const playerActive = status !== 'idle' && currentTrack !== null
  const mainRef = useRef<HTMLElement>(null)

  // Area scroll ada di <main>, bukan window: kembalikan ke atas saat pindah halaman.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-bg text-ink">
      <a
        href="#konten"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('konten')?.focus()
        }}
        className="btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70]"
      >
        Lewati ke konten
      </a>
      <Sidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col lg:ml-sidebar">
        <MobileHeader />
        <main
          ref={mainRef}
          id="konten"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] outline-none lg:pr-0"
        >
          {/* key = pathname: transisi ringan hanya saat berpindah halaman. */}
          <div key={pathname} className={`mx-auto w-full max-w-6xl animate-page-in px-4 pt-2 lg:px-8 lg:pt-8 ${
              playerActive ? 'pb-40 lg:pb-44' : 'pb-6 lg:pb-10'
            }`}>
            <Outlet />
          </div>
        </main>
        <PlayerDock />
        <BottomNav />
      </div>
    </div>
  )
}
