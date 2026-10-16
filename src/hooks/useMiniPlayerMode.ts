import { useMemo, useSyncExternalStore } from 'react'

export type MiniSide = 'left' | 'right'

interface MiniMode {
  /** true = mini player diperkecil jadi gelembung "piringan hitam". */
  collapsed: boolean
  /** Sisi layar tempat gelembung menempel. */
  side: MiniSide
}

const KEY = 'musicverse:miniPlayerMode'
const DEFAULT_MODE: MiniMode = { collapsed: false, side: 'right' }

function load(): MiniMode {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MiniMode>
      return { collapsed: parsed.collapsed === true, side: parsed.side === 'left' ? 'left' : 'right' }
    }
  } catch {
    // localStorage tidak bisa diakses / JSON rusak: pakai bawaan.
  }
  return DEFAULT_MODE
}

let mode: MiniMode = typeof window === 'undefined' ? DEFAULT_MODE : load()
const listeners = new Set<() => void>()

function update(patch: Partial<MiniMode>) {
  mode = { ...mode, ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(mode))
  } catch {
    // Gagal menyimpan tidak fatal; pilihan tetap berlaku selama sesi.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const setCollapsed = (collapsed: boolean) => update({ collapsed })
const setSide = (side: MiniSide) => update({ side })

/**
 * Mode tampilan mini player (penuh / gelembung + sisi dock), disimpan di localStorage dan dibagi
 * ke semua pemakai (MiniPlayer dan AppShell yang menyesuaikan padding konten).
 */
export function useMiniPlayerMode() {
  const current = useSyncExternalStore(subscribe, () => mode, () => DEFAULT_MODE)
  return useMemo(() => ({ ...current, setCollapsed, setSide }), [current])
}
