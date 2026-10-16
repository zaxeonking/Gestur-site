import { NavLink } from 'react-router-dom'
import { navItems } from '../../config/navigation'

/**
 * Bagian dari kolom flex AppShell (paling bawah, shrink-0), jadi selalu terlihat dan tidak
 * pernah menutupi konten. Tinggi = 4rem + 1px border + safe area bawah.
 */
export default function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="relative z-30 shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group flex h-16 flex-col items-center justify-center gap-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  isActive ? 'font-semibold text-accent' : 'font-medium text-ink-muted hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Pil di belakang ikon = penanda aktif selain warna. */}
                  <span
                    className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-accent/15' : 'group-active:bg-white/10'
                    }`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
