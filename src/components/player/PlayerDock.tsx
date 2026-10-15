import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import QueuePanel from './QueuePanel'

/** Pemilik satu-satunya state UI "full player terbuka"; semua state playback tetap di audio engine. */
export default function PlayerDock() {
  const { status, currentTrack } = useAudioPlayer()
  const [expanded, setExpanded] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const { key: locationKey } = useLocation()
  const active = status !== 'idle' && currentTrack !== null

  // Pemutar dikosongkan (cleanup / playlist diganti): tutup full player.
  useEffect(() => {
    if (!active) {
      setExpanded(false)
      setQueueOpen(false)
    }
  }, [active])

  // Pindah halaman (termasuk tombol/gesture kembali): pemutar penuh dan antrean ikut menutup
  // supaya halaman tujuan langsung terlihat. Musik tetap berjalan lewat mini player.
  useEffect(() => {
    setExpanded(false)
    setQueueOpen(false)
  }, [locationKey])

  if (!active) return null
  return (
    <>
      <MiniPlayer onOpen={() => setExpanded(true)} onOpenQueue={() => setQueueOpen(true)} />
      {expanded && <FullPlayer onClose={() => setExpanded(false)} onOpenQueue={() => setQueueOpen(true)} />}
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </>
  )
}
