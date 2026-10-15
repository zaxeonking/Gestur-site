import { ExternalLink, Link2, ListEnd, ListPlus, ListX, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import type { QueueAddResult } from '../../types/player'
import type { PlaylistTrack } from '../../types/spotify'
import { fallbackCover } from '../../utils/fallbackCover'
import { getUpcomingTracks } from '../../utils/playerQueue'
import { extractTrackId } from '../../utils/spotifyUrl'
import CoverArt from '../ui/CoverArt'
import Action from './SheetAction'

const FOCUS = 'focus-ring'

const RESULT_TEXT: Record<QueueAddResult, string> = {
  started: 'Antrean masih kosong, jadi lagu ini langsung diputar',
  added: 'Ditambahkan ke antrean',
  moved: 'Dipindah ke urutan berikutnya',
  duplicate: 'Lagu ini sudah ada di antrean',
  current: 'Lagu ini sedang diputar',
}

interface TrackMenuSheetProps {
  track: PlaylistTrack
  onClose: () => void
  onToast: (message: string) => void
}

/**
 * Menu opsi untuk satu lagu dari daftar mana pun (playlist, Cari, riwayat), muncul saat baris
 * ditahan lama atau diklik kanan. Lagu di luar playlist aktif juga bisa dimasukkan ke antrean.
 * Mobile: bottom sheet. Desktop: kartu di tengah bawah.
 */
export default function TrackMenuSheet({ track, onClose, onToast }: TrackMenuSheetProps) {
  const player = useAudioPlayer()
  const sheetRef = useRef<HTMLDivElement>(null)
  const fallback = useMemo(() => fallbackCover(`${track.title}${track.album}`), [track.title, track.album])
  const href = extractTrackId(track.url) ? track.url : undefined

  const hasQueue = player.currentTrack !== null && player.currentIndex !== null
  const isCurrent = player.currentTrack?.id === track.id
  const upcomingPosition = useMemo(
    () =>
      getUpcomingTracks(player.queue, player.currentIndex, player.shuffleOrder).findIndex(
        (item) => item.track.id === track.id,
      ),
    [player.queue, player.currentIndex, player.shuffleOrder, track.id],
  )
  const inQueue = upcomingPosition !== -1

  // Fokus masuk ke menu, dan kembali ke baris asal saat menu ditutup.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sheetRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    return () => previous?.focus?.()
  }, [])

  const run = (action: () => QueueAddResult) => {
    onToast(RESULT_TEXT[action()])
    onClose()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(track.url)
      onToast('Tautan Spotify disalin')
    } catch {
      onToast('Tidak bisa menyalin tautan di perangkat ini')
    }
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(
      sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[62]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Opsi untuk ${track.title}`}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md animate-sheet-up rounded-t-2xl border-t border-line bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl shadow-black/60 lg:bottom-6 lg:rounded-2xl lg:border"
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span className="w-12 shrink-0">
            <CoverArt cover={fallback} src={track.cover} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{track.title}</span>
            <span className="block truncate text-xs text-ink-muted">{track.artists}</span>
          </span>
        </div>

        {!hasQueue && (
          <p className="mx-4 mb-2 rounded-md bg-raised px-3 py-2 text-xs text-ink-muted">
            Belum ada antrean. Memilih salah satu opsi antrean akan memutar lagu ini lebih dulu.
          </p>
        )}

        <ul className="border-t border-line px-2 pt-2">
          <Action
            icon={Play}
            label="Putar sekarang"
            onClick={() => {
              player.playTrack(track, -1)
              onClose()
            }}
          />
          <Action
            icon={ListEnd}
            label="Putar berikutnya"
            hint={hasQueue ? 'Tepat setelah lagu yang sedang diputar' : undefined}
            onClick={() => run(() => player.playNextInQueue(track))}
            disabled={isCurrent}
          />
          {inQueue ? (
            <Action
              icon={ListX}
              label="Hapus dari antrean"
              onClick={() => {
                player.removeUpcoming(upcomingPosition)
                onToast('Dihapus dari antrean')
                onClose()
              }}
              danger
            />
          ) : (
            <Action
              icon={ListPlus}
              label="Tambah ke antrean"
              hint={hasQueue ? 'Di urutan paling akhir' : undefined}
              onClick={() => run(() => player.addToQueue(track))}
              disabled={isCurrent}
            />
          )}
          {href && <Action icon={Link2} label="Salin tautan Spotify" onClick={() => void copyLink()} />}
          {href && (
            <li>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className={`flex min-h-[3rem] w-full items-center gap-4 rounded-md px-3 text-sm font-medium text-ink transition-colors hover:bg-raised active:bg-raised ${FOCUS}`}
              >
                <ExternalLink className="h-5 w-5 shrink-0" aria-hidden="true" />
                Buka di Spotify
              </a>
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
