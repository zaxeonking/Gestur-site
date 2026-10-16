import { Link, NavLink } from 'react-router-dom'
import { navItems } from '../../config/navigation'
import { usePlaylist } from '../../context/PlaylistContext'
import type { Cover } from '../../types'
import { fallbackCover } from '../../utils/fallbackCover'
import CoverArt from '../ui/CoverArt'
import Logo from '../ui/Logo'

interface SidebarItem {
  id: string
  title: string
  subtitle: string
  cover: Cover
  src?: string
}

export default function Sidebar() {
  const { playlist } = usePlaylist()

  // Sidebar hanya berisi playlist nyata dari API (tanpa data mock).
  const items: SidebarItem[] = playlist
    ? [
        {
          id: playlist.id,
          title: playlist.title,
          subtitle: `${playlist.tracks.length} lagu`,
          cover: fallbackCover(playlist.title),
          src: playlist.cover,
        },
      ]
    : []

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-bg lg:flex">
      <div className="px-6 pb-4 pt-6">
        <Link to="/" aria-label="MusicVerse, ke Beranda" className="focus-ring -ml-1 inline-block rounded-md p-1">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Navigasi utama" className="px-3">
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `relative flex h-11 items-center gap-4 rounded-md px-3 transition-colors focus-ring ${
                    isActive ? 'bg-card font-semibold text-accent' : 'font-medium text-ink-muted hover:bg-card/60 hover:text-ink'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Penanda aktif selain warna. */}
                    {isActive && (
                      <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-accent" />
                    )}
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-6 my-4 h-px bg-line" />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-4">
        <h2 className="px-3 pb-2 text-sm font-semibold text-ink-muted">Playlist kamu</h2>
        {items.length === 0 ? (
          <p className="px-3 text-sm text-ink-muted">Belum ada playlist yang dimuat.</p>
        ) : (
          <ul aria-label="Playlist kamu" className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <NavLink
                  to="/"
                  end
                  className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-card active:bg-raised focus-ring"
                >
                  <div className="w-10 shrink-0">
                    <CoverArt cover={item.cover} src={item.src} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="truncate text-xs text-ink-muted">{item.subtitle}</p>
                  </div>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
