import { AlertCircle, History, LayoutGrid, Library, List, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RecentlyPlayedList from '../components/library/RecentlyPlayedList'
import SavedPlaylistCard from '../components/library/SavedPlaylistCard'
import Chip from '../components/ui/Chip'
import CoverArt from '../components/ui/CoverArt'
import EmptyState from '../components/ui/EmptyState'
import SectionHeader from '../components/ui/SectionHeader'
import { useLibrary, type LibraryNotice } from '../context/LibraryContext'
import { usePlaylist } from '../context/PlaylistContext'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import type { LibrarySort, LibraryView, RecentPlay, SavedPlaylist } from '../types/library'
import { fallbackCover } from '../utils/fallbackCover'
import { MAX_SAVED_PLAYLISTS, sortSavedPlaylists, toPlaylistDetail } from '../utils/libraryStorage'
import { getRowActivity } from '../utils/playerStatus'

const sortOptions: { id: LibrarySort; label: string }[] = [
  { id: 'recent', label: 'Terbaru' },
  { id: 'name', label: 'Nama A–Z' },
]

const viewOptions: { id: LibraryView; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'grid', label: 'Tampilan kisi', icon: LayoutGrid },
  { id: 'list', label: 'Tampilan daftar', icon: List },
]

const primaryButton = 'btn-primary'

function noticeMessage({ reason, title }: LibraryNotice): string {
  switch (reason) {
    case 'quota':
      return `“${title}” tidak masuk ke Koleksi karena penyimpanan browser penuh. Hapus playlist lain, lalu simpan lagi.`
    case 'limit':
      return `Koleksi sudah berisi ${MAX_SAVED_PLAYLISTS} playlist, jadi “${title}” belum disimpan. Hapus salah satu untuk menyimpannya.`
    case 'invalid':
      return `“${title}” tidak bisa disimpan karena datanya tidak valid.`
  }
}

function NoticeBar({
  role,
  children,
  onDismiss,
}: {
  role: 'alert' | 'status'
  children: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div role={role} className="flex items-start gap-3 rounded-lg bg-card px-4 py-3 text-sm text-ink">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
          className="icon-btn -my-2.5 -mr-2.5"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { playlist: active, restorePlaylist } = usePlaylist()
  const { saved, recent, prefs, health, notice, isSaved, savePlaylist, removePlaylist, clearRecent, setPrefs, dismissNotice } =
    useLibrary()
  const player = useAudioPlayer()
  const [recoveredDismissed, setRecoveredDismissed] = useState(false)
  const savedSectionRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => sortSavedPlaylists(saved, prefs.sort), [saved, prefs.sort])
  const activeId = active?.id ?? null
  const activeUnsaved = active !== null && !isSaved(active.id)

  /** Membuka playlist tersimpan di Beranda. Playlist yang sudah aktif dan playback-nya tidak disentuh. */
  const handleOpen = useCallback(
    (playlist: SavedPlaylist) => {
      restorePlaylist(toPlaylistDetail(playlist))
      navigate('/')
    },
    [restorePlaylist, navigate],
  )

  /** Hanya menghapus dari Koleksi; playlist aktif dan pemutaran yang berjalan tidak ikut berhenti. */
  const handleRemove = useCallback(
    (playlist: SavedPlaylist) => {
      removePlaylist(playlist.id)
      // Kartu yang difokuskan hilang; pindahkan fokus ke bagian ini agar pengguna keyboard/pembaca layar tidak "jatuh" ke awal halaman.
      requestAnimationFrame(() => savedSectionRef.current?.focus())
    },
    [removePlaylist],
  )

  const currentTrack = player.currentTrack
  const handlePlayRecent = useCallback(
    (entry: RecentPlay) => {
      // Lagu yang sedang aktif: tombol berfungsi sebagai jeda/lanjut/ulang.
      if (currentTrack && currentTrack.url === entry.track.url) {
        player.selectTrack(currentTrack, player.currentIndex ?? 0)
        return
      }
      // Lagu ada di playlist yang sedang dibuka: putar di dalamnya agar queue-nya tetap playlist itu.
      const index = active ? active.tracks.findIndex((track) => track.url === entry.track.url) : -1
      if (active && index !== -1) {
        player.selectTrack(active.tracks[index], index)
        return
      }
      player.playAll([entry.track])
    },
    [active, currentTrack, player],
  )

  const showRecovered = health === 'recovered' && !recoveredDismissed

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Koleksi</h1>
          <p className="mt-1 text-ink-muted">Playlist yang pernah kamu muat dan lagu yang baru kamu putar.</p>
        </div>
        {saved.length > 0 && (
          <Link to="/" className={primaryButton}>
            Muat playlist
          </Link>
        )}
      </header>

      {(notice || health === 'unavailable' || showRecovered) && (
        <div className="space-y-2">
          {notice && (
            <NoticeBar role="alert" onDismiss={dismissNotice}>
              {noticeMessage(notice)}
            </NoticeBar>
          )}
          {health === 'unavailable' && (
            <NoticeBar role="status">
              Browser tidak mengizinkan penyimpanan lokal. Koleksi dan riwayat hanya bertahan selama tab ini terbuka.
            </NoticeBar>
          )}
          {showRecovered && (
            <NoticeBar role="status" onDismiss={() => setRecoveredDismissed(true)}>
              Sebagian data Koleksi di perangkat ini rusak atau tidak valid, jadi diabaikan. Data yang valid tetap tampil.
            </NoticeBar>
          )}
        </div>
      )}

      {activeUnsaved && active && (
        <section
          aria-label="Playlist yang sedang dibuka belum tersimpan"
          className="flex flex-col gap-3 rounded-lg bg-card p-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="w-14 shrink-0">
              <CoverArt cover={fallbackCover(active.title)} src={active.cover} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{active.title}</p>
              <p className="text-sm text-ink-muted">
                {active.tracks.length} lagu · Sedang dibuka, belum ada di Koleksi
              </p>
            </div>
          </div>
          <button type="button" onClick={() => savePlaylist(active)} className={primaryButton}>
            Simpan ke Koleksi
          </button>
        </section>
      )}

      <section aria-label="Playlist tersimpan">
        <div ref={savedSectionRef} tabIndex={-1} className="outline-none">
          <SectionHeader
            title="Playlist tersimpan"
            subtitle={saved.length > 0 ? `${saved.length} playlist di perangkat ini` : undefined}
          />
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Belum ada playlist tersimpan"
            description="Playlist Spotify yang berhasil kamu muat akan disimpan otomatis di browser ini dan muncul di sini."
            action={
              <Link to="/" className={primaryButton}>
                Muat playlist
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="no-scrollbar -m-1 flex gap-2 overflow-x-auto p-1" role="group" aria-label="Urutkan playlist">
                {sortOptions.map((option) => (
                  <Chip key={option.id} active={prefs.sort === option.id} onClick={() => setPrefs({ sort: option.id })}>
                    {option.label}
                  </Chip>
                ))}
              </div>

              <div className="flex shrink-0 rounded-full bg-raised p-1" role="group" aria-label="Tampilan">
                {viewOptions.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-pressed={prefs.view === id}
                    onClick={() => setPrefs({ view: id })}
                    className={`flex h-9 w-11 items-center justify-center rounded-full transition-colors active:scale-95 focus-ring motion-reduce:active:scale-100 ${
                      prefs.view === id ? 'bg-bg text-accent' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <ul
              className={
                prefs.view === 'grid'
                  ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5'
                  : '-mx-2'
              }
            >
              {sorted.map((playlist) => (
                <SavedPlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  layout={prefs.view}
                  active={playlist.id === activeId}
                  onOpen={handleOpen}
                  onRemove={handleRemove}
                />
              ))}
            </ul>

            <p className="text-xs text-ink-faint">
              Disimpan hanya di browser ini dan bisa hilang jika data browser dihapus. Memutar lagu tetap membutuhkan
              koneksi internet.
            </p>
          </div>
        )}
      </section>

      <section aria-label="Baru diputar">
        <SectionHeader
          title="Baru diputar"
          subtitle={recent.length > 0 ? 'Lagu yang terakhir benar-benar terdengar' : undefined}
          action={
            recent.length > 0 ? (
              <button
                type="button"
                onClick={clearRecent}
                className="inline-flex h-10 shrink-0 items-center rounded-full px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-white/5 hover:text-ink active:bg-white/10 focus-ring"
              >
                Hapus riwayat
              </button>
            ) : undefined
          }
        />

        {recent.length === 0 ? (
          <EmptyState
            compact
            icon={History}
            title="Belum ada lagu yang diputar"
            description="Lagu yang kamu putar akan muncul di sini, lengkap dengan waktu putarnya."
          />
        ) : (
          <RecentlyPlayedList
            items={recent}
            currentTrackUrl={currentTrack?.url ?? null}
            currentActivity={getRowActivity(player.status)}
            onPlay={handlePlayRecent}
          />
        )}
      </section>
    </div>
  )
}
