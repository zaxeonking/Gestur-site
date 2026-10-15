/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface PlayerUiState {
  fullPlayerOpen: boolean
}
interface PlayerUiActions {
  openFullPlayer: () => void
  closeFullPlayer: () => void
}

const StateContext = createContext<PlayerUiState | null>(null)
const ActionsContext = createContext<PlayerUiActions | null>(null)

/**
 * State tampilan "pemutar penuh terbuka". Dipisah dari PlayerDock agar baris lagu di halaman mana pun
 * bisa membukanya. Aksi punya identitas stabil, jadi baris lagu tidak render ulang saat pemutar dibuka.
 */
export function PlayerUiProvider({ children }: { children: ReactNode }) {
  const [fullPlayerOpen, setOpen] = useState(false)
  const openFullPlayer = useCallback(() => setOpen(true), [])
  const closeFullPlayer = useCallback(() => setOpen(false), [])
  const state = useMemo(() => ({ fullPlayerOpen }), [fullPlayerOpen])
  const actions = useMemo(() => ({ openFullPlayer, closeFullPlayer }), [openFullPlayer, closeFullPlayer])
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
  return { ...state, ...actions }
}

/** Hanya aksi (identitas stabil): tidak render ulang saat pemutar penuh dibuka/ditutup. */
export function usePlayerUiActions(): PlayerUiActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('usePlayerUiActions harus dipakai di dalam <PlayerUiProvider>.')
  return actions
}
