import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import type { LibraryPrefs, RecentPlay, SavedPlaylist, StorageHealth } from '../types/library'
import type { PlaylistDetail, PlaylistTrack } from '../types/spotify'
import {
  addRecentPlay,
  findSavedMatch,
  LIBRARY_KEYS,
  readPrefs,
  readRecentPlays,
  readSavedPlaylists,
  removeSavedPlaylist,
  upsertSavedPlaylist,
  writePrefs,
  writeRecentPlays,
  writeSavedPlaylists,
  type RecentPlaySource,
} from '../utils/libraryStorage'
import { usePlaylist } from './PlaylistContext'

/** Penyimpanan gagal untuk alasan yang perlu diketahui pengguna. */
export interface LibraryNotice {
  reason: 'quota' | 'limit' | 'invalid' | 'single' | 'unavailable'
  /** Operasi yang gagal. */
  action: 'save' | 'remove'
  /** Judul playlist/lagu yang gagal diproses. */
  title: string
}

export interface LibraryContextValue {
  /** Playlist tersimpan, urutan terbaru lebih dulu (urutan tampilan ditentukan halaman). */
  saved: readonly SavedPlaylist[]
  recent: readonly RecentPlay[]
  prefs: LibraryPrefs
  /** Kondisi penyimpanan perangkat; lihat `StorageHealth`. */
  health: StorageHealth
  notice: LibraryNotice | null
  isSaved: (playlistId: string) => boolean
  /** ID entri Koleksi yang sama dengan `playlist` (termasuk lagu pencarian yang sama), atau null. */
  savedIdFor: (playlist: PlaylistDetail) => string | null
  /**
   * Menyimpan/memperbarui playlist di Koleksi. Mengembalikan true HANYA jika benar-benar tersimpan
   * di penyimpanan perangkat. `allowMemoryOnly` (simpan otomatis) mengizinkan simpanan di memori
   * saat localStorage tidak bisa diakses.
   */
  savePlaylist: (playlist: PlaylistDetail, options?: { allowMemoryOnly?: boolean }) => boolean
  /** Menghapus dari Koleksi. Mengembalikan true jika penghapusan berhasil tersimpan. */
  removePlaylist: (playlistId: string) => boolean
  clearRecent: () => void
  setPrefs: (patch: Partial<LibraryPrefs>) => void
  dismissNotice: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

interface InitialLibrary {
  saved: SavedPlaylist[]
  recent: RecentPlay[]
  prefs: LibraryPrefs
  health: StorageHealth
}

function mergeHealth(a: StorageHealth, b: StorageHealth): StorageHealth {
  if (a === 'unavailable' || b === 'unavailable') return 'unavailable'
  if (a === 'recovered' || b === 'recovered') return 'recovered'
  return 'ok'
}

function readEverything(): InitialLibrary {
  const saved = readSavedPlaylists()
  const recent = readRecentPlays()
  return {
    saved: saved.items,
    recent: recent.items,
    prefs: readPrefs(),
    health: mergeHealth(saved.health, recent.health),
  }
}

/**
 * Sumber data Koleksi. Harus berada di dalam <PlaylistProvider> dan <AudioPlayerProvider>.
 *
 * - Playlist yang BERHASIL dimuat dari API otomatis disimpan. Playlist yang hanya dipulihkan
 *   dari penyimpanan (`fromCache`) tidak disimpan ulang, jadi menghapus dari Koleksi tidak
 *   "hidup kembali" hanya karena halaman dibuka lagi.
 * - Lagu masuk Recently Played saat status playback benar-benar `playing` (event audio), bukan
 *   saat tombol ditekan atau URL audio didapat.
 * - Setiap perubahan membaca ulang penyimpanan dulu (baca-ubah-tulis), sehingga dua tab tidak saling menimpa.
 * - Jika localStorage tidak bisa diakses, Koleksi tetap bekerja di memori selama tab terbuka.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readEverything)
  const [saved, setSaved] = useState<SavedPlaylist[]>(initial.saved)
  const [recent, setRecent] = useState<RecentPlay[]>(initial.recent)
  const [prefs, setPrefsState] = useState<LibraryPrefs>(initial.prefs)
  const [health, setHealth] = useState<StorageHealth>(initial.health)
  const [notice, setNotice] = useState<LibraryNotice | null>(null)

  // Salinan terbaru untuk callback yang identitasnya harus stabil.
  const savedRef = useRef(saved)
  const recentRef = useRef(recent)
  const prefsRef = useRef(prefs)

  const commitSaved = useCallback((list: SavedPlaylist[]) => {
    savedRef.current = list
    setSaved(list)
  }, [])
  const commitRecent = useCallback((list: RecentPlay[]) => {
    recentRef.current = list
    setRecent(list)
  }, [])

  const savePlaylist = useCallback(
    (playlist: PlaylistDetail, options?: { allowMemoryOnly?: boolean }): boolean => {
      const read = readSavedPlaylists()
      const memoryOnly = read.health === 'unavailable'
      const base = memoryOnly ? savedRef.current : read.items

      // Kembalikan state ke isi penyimpanan sebenarnya dan beri tahu pengguna: tidak ada status "berhasil" palsu.
      const fail = (reason: LibraryNotice['reason']): false => {
        commitSaved(base)
        setNotice({ reason, action: 'save', title: playlist.title })
        return false
      }

      const result = upsertSavedPlaylist(base, playlist)
      if (!result.ok) return fail(result.reason)

      const write = writeSavedPlaylists(result.list)
      if (!write.ok) {
        if (write.reason === 'quota') return fail('quota')
        if (!options?.allowMemoryOnly) {
          setHealth('unavailable')
          return fail('unavailable')
        }
      }

      commitSaved(result.list)
      setNotice(null)
      setHealth(write.ok ? 'ok' : 'unavailable')
      return true
    },
    [commitSaved],
  )

  const removePlaylist = useCallback(
    (playlistId: string): boolean => {
      const read = readSavedPlaylists()
      const memoryOnly = read.health === 'unavailable'
      const base = memoryOnly ? savedRef.current : read.items
      const target = base.find((item) => item.id === playlistId)
      const next = removeSavedPlaylist(base, playlistId)
      const write = writeSavedPlaylists(next)

      // Penghapusan yang tidak tersimpan akan "hidup lagi" setelah reload: jangan tampilkan seolah berhasil.
      if (!write.ok && !memoryOnly) {
        commitSaved(base)
        setHealth('unavailable')
        setNotice({ reason: write.reason, action: 'remove', title: target?.title ?? '' })
        return false
      }

      commitSaved(next)
      setNotice(null)
      setHealth(write.ok ? 'ok' : 'unavailable')
      return true
    },
    [commitSaved],
  )

  const recordPlay = useCallback(
    (track: PlaylistTrack, source: RecentPlaySource) => {
      const read = readRecentPlays()
      const base = read.health === 'unavailable' ? recentRef.current : read.items
      const next = addRecentPlay(base, track, source)
      const write = writeRecentPlays(next)
      commitRecent(next)
      if (!write.ok && write.reason === 'unavailable') setHealth('unavailable')
    },
    [commitRecent],
  )

  const clearRecent = useCallback(() => {
    writeRecentPlays([])
    commitRecent([])
  }, [commitRecent])

  const setPrefs = useCallback((patch: Partial<LibraryPrefs>) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefsState(next)
    writePrefs(next) // preferensi gagal tersimpan = kembali ke bawaan di kunjungan berikutnya; tidak perlu pemberitahuan
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  /* Tab lain mengubah Koleksi: ikuti. */
  useEffect(() => {
    const ownKeys: string[] = Object.values(LIBRARY_KEYS)
    function onStorage(event: StorageEvent) {
      if (event.key !== null && !ownKeys.includes(event.key)) return
      const next = readEverything()
      if (next.health === 'unavailable') return
      commitSaved(next.saved)
      commitRecent(next.recent)
      prefsRef.current = next.prefs
      setPrefsState(next.prefs)
      setHealth(next.health)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [commitRecent, commitSaved])

  /* Simpan otomatis playlist yang baru berhasil dimuat dari API. */
  const { playlist, status: playlistStatus, fromCache } = usePlaylist()
  const lastAutoSavedRef = useRef<PlaylistDetail | null>(null)
  useEffect(() => {
    if (!playlist || playlistStatus !== 'success' || fromCache || playlist.source === 'search') return
    if (lastAutoSavedRef.current === playlist) return
    lastAutoSavedRef.current = playlist
    savePlaylist(playlist, { allowMemoryOnly: true })
  }, [playlist, playlistStatus, fromCache, savePlaylist])

  /* Catat Recently Played saat audio benar-benar terdengar. */
  const { status: playerStatus, currentTrack } = useAudioPlayer()
  const recordedTrackIdRef = useRef<string | null>(null)
  useEffect(() => {
    // Pergantian lagu / pemutaran ulang selalu melewati salah satu status ini.
    if (playerStatus === 'idle' || playerStatus === 'resolving' || playerStatus === 'error' || playerStatus === 'ended') {
      recordedTrackIdRef.current = null
      return
    }
    if (playerStatus !== 'playing' || !currentTrack) return
    // Jeda lalu lanjut melewati loading → playing dengan lagu yang sama: tidak dicatat dua kali.
    if (recordedTrackIdRef.current === currentTrack.id) return
    recordedTrackIdRef.current = currentTrack.id

    const fromActivePlaylist =
      playlist?.tracks.some((track) => track.id === currentTrack.id && track.url === currentTrack.url) ?? false
    recordPlay(
      currentTrack,
      fromActivePlaylist && playlist ? { playlistId: playlist.id, playlistTitle: playlist.title } : {},
    )
  }, [playerStatus, currentTrack, playlist, recordPlay])

  const value = useMemo<LibraryContextValue>(
    () => ({
      saved,
      recent,
      prefs,
      health,
      notice,
      isSaved: (playlistId: string) => saved.some((item) => item.id === playlistId),
      savedIdFor: (target: PlaylistDetail) => findSavedMatch(saved, target)?.id ?? null,
      savePlaylist,
      removePlaylist,
      clearRecent,
      setPrefs,
      dismissNotice,
    }),
    [saved, recent, prefs, health, notice, savePlaylist, removePlaylist, clearRecent, setPrefs, dismissNotice],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext)
  if (!context) throw new Error('useLibrary harus dipakai di dalam <LibraryProvider>.')
  return context
}
