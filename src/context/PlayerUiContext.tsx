/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate, type Location, type NavigateFunction } from 'react-router-dom'

/**
 * Lapisan layar penuh (pemutar penuh, antrean) disimpan sebagai entri riwayat, bukan state lokal:
 *  - membuka  = menambah satu entri riwayat di halaman yang SAMA (URL tidak berubah, ada penanda di state),
 *  - tombol Kembali (Android/browser) = membuang entri itu, jadi hanya lapisannya yang menutup dan
 *    halaman di bawahnya tetap,
 *  - tombol tutup di layar = history back, hasilnya identik dengan tombol Kembali.
 * Antrean yang dibuka dari pemutar penuh menumpuk di atasnya: Kembali menutup antrean dulu, lalu pemutar.
 */
interface OverlayState {
  fullPlayer: boolean
  queue: boolean
}

interface PlayerUiState {
  fullPlayerOpen: boolean
  queueOpen: boolean
}
interface PlayerUiActions {
  openFullPlayer: () => void
  closeFullPlayer: () => void
  openQueue: () => void
  closeQueue: () => void
  /**
   * Menghapus penanda lapisan dari entri riwayat saat ini tanpa menambah/menghapus entri. Dipakai saat
   * pemutar kosong tetapi penanda masih ada (mis. halaman dimuat ulang saat pemutar penuh terbuka).
   */
  resetOverlays: () => void
}

const NO_OVERLAY: OverlayState = { fullPlayer: false, queue: false }

function readOverlay(state: unknown): OverlayState {
  if (typeof state !== 'object' || state === null) return NO_OVERLAY
  const { fullPlayer, queue } = state as Record<string, unknown>
  if (fullPlayer !== true && queue !== true) return NO_OVERLAY
  return { fullPlayer: fullPlayer === true, queue: queue === true }
}

const StateContext = createContext<PlayerUiState | null>(null)
const ActionsContext = createContext<PlayerUiActions | null>(null)

/**
 * Harus berada di dalam router. Aksinya punya identitas stabil (membaca lokasi lewat ref), jadi baris
 * lagu tidak render ulang saat lapisan dibuka atau ditutup.
 */
export function PlayerUiProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const overlay = readOverlay(location.state)

  const latest = useRef<{ location: Location; navigate: NavigateFunction; overlay: OverlayState }>({
    location,
    navigate,
    overlay,
  })
  useEffect(() => {
    latest.current = { location, navigate, overlay }
  })

  const push = useCallback((patch: Partial<OverlayState>) => {
    const { location: here, navigate: go, overlay: current } = latest.current
    // replace: false dipaksa agar tetap menambah entri walau URL-nya sama.
    go({ pathname: here.pathname, search: here.search, hash: here.hash }, { replace: false, state: { ...current, ...patch } })
  }, [])

  const actions = useMemo<PlayerUiActions>(
    () => ({
      openFullPlayer: () => {
        if (!latest.current.overlay.fullPlayer) push({ fullPlayer: true })
      },
      closeFullPlayer: () => {
        if (latest.current.overlay.fullPlayer) latest.current.navigate(-1)
      },
      openQueue: () => {
        if (!latest.current.overlay.queue) push({ queue: true })
      },
      closeQueue: () => {
        if (latest.current.overlay.queue) latest.current.navigate(-1)
      },
      resetOverlays: () => {
        const { location: here, navigate: go, overlay: current } = latest.current
        if (!current.fullPlayer && !current.queue) return
        go({ pathname: here.pathname, search: here.search, hash: here.hash }, { replace: true, state: null })
      },
    }),
    [push],
  )

  const state = useMemo<PlayerUiState>(
    () => ({ fullPlayerOpen: overlay.fullPlayer, queueOpen: overlay.queue }),
    [overlay.fullPlayer, overlay.queue],
  )

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  )
}

export function usePlayerUi(): PlayerUiState & PlayerUiActions {
  const state = useContext(StateContext)
  const actions = useContext(ActionsContext)
  if (!state || !actions) throw new Error('usePlayerUi harus dipakai di dalam <PlayerUiProvider>.')
  return useMemo(() => ({ ...state, ...actions }), [state, actions])
}

/** Hanya aksi (identitas stabil): tidak render ulang saat lapisan dibuka/ditutup. */
export function usePlayerUiActions(): PlayerUiActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('usePlayerUiActions harus dipakai di dalam <PlayerUiProvider>.')
  return actions
}
