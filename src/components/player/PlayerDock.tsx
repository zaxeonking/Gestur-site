import { useEffect } from 'react'
import { usePlayerUi } from '../../context/PlayerUiContext'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import QueuePanel from './QueuePanel'

/**
 * Merender mini player + lapisan pemutar penuh/antrean. Status "terbuka" ada di PlayerUiContext
 * (entri riwayat), jadi tombol Kembali hanya menutup lapisan dan halaman di bawahnya tidak ikut mundur.
 * Semua state playback tetap di audio engine.
 */
export default function PlayerDock() {
  const { status, currentTrack } = useAudioPlayer()
  const { fullPlayerOpen, queueOpen, openFullPlayer, closeFullPlayer, openQueue, closeQueue, resetOverlays } =
    usePlayerUi()
  const active = status !== 'idle' && currentTrack !== null

  // Pemutar dikosongkan (cleanup / playlist diganti) atau halaman dimuat ulang dengan penanda lama:
  // bersihkan penanda lapisan.
  useEffect(() => {
    if (!active) resetOverlays()
  }, [active, resetOverlays])

  if (!active) return null
  return (
    <>
      <MiniPlayer onOpen={openFullPlayer} onOpenQueue={openQueue} />
      {fullPlayerOpen && <FullPlayer onClose={closeFullPlayer} onOpenQueue={openQueue} />}
      {queueOpen && <QueuePanel onClose={closeQueue} />}
    </>
  )
}
