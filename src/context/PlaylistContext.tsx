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
import { fetchPlaylist, SpotifyApiError } from '../services/spotifyApi'
import type { PlaylistDetail } from '../types/spotify'
import { clearLastPlaylist, loadLastPlaylist, saveLastPlaylist } from '../utils/playlistStorage'

export type PlaylistStatus = 'idle' | 'loading' | 'success' | 'error'

export interface PlaylistState {
  status: PlaylistStatus
  playlist: PlaylistDetail | null
  error: string | null
  /** URL terakhir yang diminta, dipakai untuk retry dan muat ulang. */
  requestedUrl: string | null
  /** True jika playlist yang tampil dipulihkan dari penyimpanan perangkat. */
  fromCache: boolean
}

export interface PlaylistContextValue extends PlaylistState {
  /** True saat API dipakai (memuat, berhasil, atau gagal) — data mock disembunyikan. */
  isLive: boolean
  canRetry: boolean
  /** Memuat playlist lewat fetchPlaylist. Mengembalikan true jika berhasil. */
  loadPlaylist: (playlistUrl: string) => Promise<boolean>
  /** Mengulang permintaan terakhir. */
  retry: () => Promise<boolean>
  /** Menghapus playlist (termasuk cache) dan kembali ke keadaan kosong. */
  reset: () => void
  /**
   * Menampilkan playlist dari data yang sudah ada di perangkat (mis. dari Koleksi) tanpa memanggil API.
   * Ditandai `fromCache`, jadi tidak disimpan ulang ke Koleksi. Playlist dengan ID yang sama dengan
   * yang sedang aktif dibiarkan apa adanya agar data yang lebih baru dan playback tidak terganggu.
   */
  restorePlaylist: (playlist: PlaylistDetail) => void
}

const emptyState: PlaylistState = {
  status: 'idle',
  playlist: null,
  error: null,
  requestedUrl: null,
  fromCache: false,
}

function createInitialState(): PlaylistState {
  const cached = loadLastPlaylist()
  if (!cached) return emptyState
  return { status: 'success', playlist: cached, error: null, requestedUrl: cached.url, fromCache: true }
}

export const PlaylistContext = createContext<PlaylistContextValue | null>(null)

function toMessage(error: unknown): string {
  if (error instanceof SpotifyApiError) return error.message
  return 'Terjadi kesalahan yang tidak terduga. Coba lagi.'
}

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlaylistState>(createInitialState)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const loadPlaylist = useCallback(async (playlistUrl: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState((prev) => ({ ...prev, status: 'loading', error: null, requestedUrl: playlistUrl }))

    try {
      const playlist = await fetchPlaylist(playlistUrl, { signal: controller.signal })
      if (controller.signal.aborted) return false
      saveLastPlaylist(playlist)
      setState({
        status: 'success',
        playlist,
        error: null,
        requestedUrl: playlist.url,
        fromCache: false,
      })
      return true
    } catch (error) {
      if (controller.signal.aborted) return false
      setState((prev) => ({ ...prev, status: 'error', error: toMessage(error) }))
      return false
    }
  }, [])

  const retry = useCallback(async () => {
    if (!state.requestedUrl) return false
    return loadPlaylist(state.requestedUrl)
  }, [state.requestedUrl, loadPlaylist])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    clearLastPlaylist()
    setState(emptyState)
  }, [])

  const activeId = state.playlist?.id ?? null
  const restorePlaylist = useCallback(
    (playlist: PlaylistDetail) => {
      // Sudah aktif: jangan ganti dengan salinan yang mungkin lebih lama, dan jangan batalkan muat ulangnya.
      if (activeId === playlist.id) return
      // Permintaan yang masih berjalan milik playlist lain; batalkan agar tidak menimpa pilihan ini.
      controllerRef.current?.abort()
      controllerRef.current = null
      saveLastPlaylist(playlist)
      setState({ status: 'success', playlist, error: null, requestedUrl: playlist.url, fromCache: true })
    },
    [activeId],
  )

  const value = useMemo<PlaylistContextValue>(
    () => ({
      ...state,
      isLive: state.playlist !== null || state.status !== 'idle',
      canRetry: state.requestedUrl !== null,
      loadPlaylist,
      retry,
      reset,
      restorePlaylist,
    }),
    [state, loadPlaylist, retry, reset, restorePlaylist],
  )

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlaylist(): PlaylistContextValue {
  const context = useContext(PlaylistContext)
  if (!context) throw new Error('usePlaylist harus dipakai di dalam <PlaylistProvider>.')
  return context
}
