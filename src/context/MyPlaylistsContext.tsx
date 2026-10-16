import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MyPlaylist, StorageHealth } from '../types/library'
import type { PlaylistTrack } from '../types/spotify'
import {
  addTrackToMyPlaylist,
  createMyPlaylist,
  deleteMyPlaylist,
  moveTrackInMyPlaylist,
  MY_PLAYLISTS_KEY,
  readMyPlaylists,
  removeTrackFromMyPlaylist,
  renameMyPlaylist,
  writeMyPlaylists,
  type MyPlaylistChange,
  type MyPlaylistFailure,
} from '../utils/myPlaylistStorage'

/** Alasan gagal: kegagalan aturan (lihat MyPlaylistFailure) atau penyimpanan perangkat. */
export type MyPlaylistError = MyPlaylistFailure | 'quota' | 'unavailable'
export type MyPlaylistResult<T> = { ok: true; value: T } | { ok: false; reason: MyPlaylistError }

export interface MyPlaylistsContextValue {
  /** Terbaru diubah lebih dulu. */
  playlists: readonly MyPlaylist[]
  health: StorageHealth
  getPlaylist: (id: string) => MyPlaylist | undefined
  createPlaylist: (name: string) => MyPlaylistResult<MyPlaylist>
  renamePlaylist: (id: string, name: string) => MyPlaylistResult<MyPlaylist>
  deletePlaylist: (id: string) => MyPlaylistResult<null>
  addTrack: (playlistId: string, track: PlaylistTrack) => MyPlaylistResult<MyPlaylist>
  removeTrack: (playlistId: string, trackId: string) => MyPlaylistResult<MyPlaylist>
  moveTrack: (playlistId: string, from: number, to: number) => MyPlaylistResult<MyPlaylist>
}

const MyPlaylistsContext = createContext<MyPlaylistsContextValue | null>(null)

const byRecent = (list: readonly MyPlaylist[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)

/** Pesan singkat untuk pengguna dari alasan gagal. */
// eslint-disable-next-line react-refresh/only-export-components
export function myPlaylistErrorText(reason: MyPlaylistError): string {
  switch (reason) {
    case 'limit':
      return 'Batas playlist atau jumlah lagu sudah tercapai'
    case 'invalid':
      return 'Nama atau data tidak valid'
    case 'duplicate':
      return 'Lagu ini sudah ada di playlist itu'
    case 'missing':
      return 'Playlist tidak ditemukan'
    case 'quota':
      return 'Penyimpanan browser penuh, perubahan tidak tersimpan'
    case 'unavailable':
      return 'Browser tidak mengizinkan penyimpanan lokal'
  }
}

/**
 * Sumber data "Playlist saya". Setiap perubahan membaca ulang penyimpanan dulu (baca-ubah-tulis) supaya
 * dua tab tidak saling menimpa. Perubahan yang gagal tersimpan TIDAK ditampilkan seolah berhasil. Jika
 * localStorage tidak bisa diakses sama sekali, playlist hidup di memori selama tab terbuka.
 */
export function MyPlaylistsProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readMyPlaylists)
  const [playlists, setPlaylists] = useState<MyPlaylist[]>(() => byRecent(initial.items))
  const [health, setHealth] = useState<StorageHealth>(initial.health)
  const listRef = useRef(playlists)

  const commit = useCallback((list: MyPlaylist[]) => {
    const sorted = byRecent(list)
    listRef.current = sorted
    setPlaylists(sorted)
  }, [])

  const mutate = useCallback(
    <T,>(op: (list: readonly MyPlaylist[]) => MyPlaylistChange<T>): MyPlaylistResult<T> => {
      const read = readMyPlaylists()
      const memoryOnly = read.health === 'unavailable'
      const base = memoryOnly ? listRef.current : read.items
      const change = op(base)
      if (!change.ok) return { ok: false, reason: change.reason }
      const write = writeMyPlaylists(change.list)
      if (!write.ok) {
        if (write.reason === 'quota') {
          commit(base)
          return { ok: false, reason: 'quota' }
        }
        // Penyimpanan tidak tersedia: tetap bekerja di memori, tapi beri tahu lewat `health`.
        setHealth('unavailable')
      } else {
        setHealth('ok')
      }
      commit(change.list)
      return { ok: true, value: change.value }
    },
    [commit],
  )

  const createPlaylist = useCallback((name: string) => mutate((l) => createMyPlaylist(l, name)), [mutate])
  const renamePlaylist = useCallback((id: string, name: string) => mutate((l) => renameMyPlaylist(l, id, name)), [mutate])
  const deletePlaylist = useCallback((id: string) => mutate((l) => deleteMyPlaylist(l, id)), [mutate])
  const addTrack = useCallback((id: string, track: PlaylistTrack) => mutate((l) => addTrackToMyPlaylist(l, id, track)), [mutate])
  const removeTrack = useCallback((id: string, trackId: string) => mutate((l) => removeTrackFromMyPlaylist(l, id, trackId)), [mutate])
  const moveTrack = useCallback((id: string, from: number, to: number) => mutate((l) => moveTrackInMyPlaylist(l, id, from, to)), [mutate])

  /* Tab lain mengubah playlist: ikuti. */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== MY_PLAYLISTS_KEY) return
      const next = readMyPlaylists()
      if (next.health === 'unavailable') return
      commit(next.items)
      setHealth(next.health)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [commit])

  const value = useMemo<MyPlaylistsContextValue>(
    () => ({
      playlists,
      health,
      getPlaylist: (id: string) => playlists.find((item) => item.id === id),
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTrack,
      removeTrack,
      moveTrack,
    }),
    [playlists, health, createPlaylist, renamePlaylist, deletePlaylist, addTrack, removeTrack, moveTrack],
  )

  return <MyPlaylistsContext.Provider value={value}>{children}</MyPlaylistsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMyPlaylists(): MyPlaylistsContextValue {
  const context = useContext(MyPlaylistsContext)
  if (!context) throw new Error('useMyPlaylists harus dipakai di dalam <MyPlaylistsProvider>.')
  return context
}
