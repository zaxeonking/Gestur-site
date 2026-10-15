/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import TrackMenuSheet from '../components/player/TrackMenuSheet'
import type { PlaylistTrack } from '../types/spotify'

interface TrackMenuApi {
  /**
   * Membuka menu opsi untuk satu lagu dari daftar mana pun. Identitasnya stabil.
   * `fromSearch` = baris itu hasil pencarian: hanya dari sana lagu di luar antrean boleh dimasukkan ke antrean.
   */
  openTrackMenu: (track: PlaylistTrack, options?: { fromSearch?: boolean }) => void
  /** Menampilkan pesan singkat di bawah layar. */
  showToast: (message: string) => void
}

const TrackMenuContext = createContext<TrackMenuApi | null>(null)

const TOAST_MS = 2400

/**
 * Pemilik satu-satunya menu opsi lagu (tahan lama pada baris lagu di seluruh aplikasi) dan toast.
 * Harus berada di dalam <AudioPlayerProvider>. State menu/toast hanya dirender di sini, sehingga
 * daftar lagu tidak ikut render ulang saat menu dibuka atau ditutup.
 */
export function TrackMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ track: PlaylistTrack; fromSearch: boolean } | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const toastTimer = useRef<number | null>(null)

  const openTrackMenu = useCallback(
    (next: PlaylistTrack, options?: { fromSearch?: boolean }) =>
      setMenu({ track: next, fromSearch: options?.fromSearch === true }),
    [],
  )
  const closeMenu = useCallback(() => setMenu(null), [])

  const showToast = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message })
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const api = useMemo<TrackMenuApi>(() => ({ openTrackMenu, showToast }), [openTrackMenu, showToast])

  return (
    <TrackMenuContext.Provider value={api}>
      {children}
      {menu && (
        <TrackMenuSheet track={menu.track} fromSearch={menu.fromSearch} onClose={closeMenu} onToast={showToast} />
      )}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-[65] flex justify-center px-4 lg:bottom-28"
      >
        {toast && (
          <p
            key={toast.id}
            className="max-w-sm animate-fade-in rounded-full bg-raised px-4 py-2.5 text-center text-sm font-medium text-ink shadow-xl shadow-black/50"
          >
            {toast.message}
          </p>
        )}
      </div>
    </TrackMenuContext.Provider>
  )
}

export function useTrackMenu(): TrackMenuApi {
  const api = useContext(TrackMenuContext)
  if (!api) throw new Error('useTrackMenu harus dipakai di dalam <TrackMenuProvider>.')
  return api
}
