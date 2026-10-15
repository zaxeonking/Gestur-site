import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { usePlayerUi } from '../../context/PlayerUiContext'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import QueuePanel from './QueuePanel'

/** Pemilik satu-satunya state UI "full player terbuka"; semua state playback tetap di audio engine. */
export default function PlayerDock() {
  const { status, currentTrack } = useAudioPlayer()
  const { fullPlayerOpen: expanded, openFullPlayer, closeFullPlayer } = usePlayerUi()
  const [queueOpen, setQueueOpen] = useState(false)
  const { key: locationKey } = useLocation()
  const active = status !== 'idle' && currentTrack !== null

  // Pemutar dikosongkan (cleanup / playlist diganti): tutup full player.
  useEffect(() => {
    if (!active) {
      closeFullPlayer()
      setQueueOpen(false)
    }
  }, [active, closeFullPlayer])

  // Pindah halaman (termasuk tombol/gesture kembali): pemutar penuh dan antrean ikut menutup
  // supaya halaman tujuan langsung terlihat. Musik tetap berjalan lewat mini player.
  useEffect(() => {
    closeFullPlayer()
    setQueueOpen(false)
  }, [locationKey, closeFullPlayer])

  if (!active) return null
  return (
    <>
      <MiniPlayer onOpen={openFullPlayer} onOpenQueue={() => setQueueOpen(true)} />
      {expanded && <FullPlayer onClose={closeFullPlayer} onOpenQueue={() => setQueueOpen(true)} />}
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </>
  )
}
