import { Home, Library, Search, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Beranda', icon: Home },
  { to: '/search', label: 'Cari', icon: Search },
  { to: '/library', label: 'Koleksi', icon: Library },
]
