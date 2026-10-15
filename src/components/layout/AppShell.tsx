import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import PlayerDock from '../player/PlayerDock'
import BottomNav from './BottomNav'
import MobileHeader from './MobileHeader'
import Sidebar from './Sidebar'

export default function AppShell() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-dvh bg-bg text-ink">
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
      <MobileHeader />
      {/* --mini-player-h diisi MiniPlayer (0 saat tidak ada lagu) agar konten tidak tertutup. */}
      <main
        id="konten"
        tabIndex={-1}
        className="pb-[calc(5.5rem+env(safe-area-inset-bottom)+var(--mini-player-h,0px))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] outline-none lg:ml-sidebar lg:pb-[calc(2.5rem+var(--mini-player-h,0px))]"
      >
        {/* key = pathname: transisi ringan hanya saat berpindah halaman. */}
        <div key={pathname} className="mx-auto w-full max-w-6xl animate-page-in px-4 pb-6 pt-2 lg:px-8 lg:pt-8">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <PlayerDock />
      <ScrollRestoration />
    </div>
  )
}
