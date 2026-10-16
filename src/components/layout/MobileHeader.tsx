import { Link } from 'react-router-dom'
import { usePlayerUiActions } from '../../context/PlayerUiContext'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { QueueButton } from '../player/PlayerControls'
import Logo from '../ui/Logo'

export default function MobileHeader() {
  const { status, currentTrack } = useAudioPlayer()
  const { openQueue } = usePlayerUiActions()
  const active = status !== 'idle' && currentTrack !== null

  return (
    // Tinggi dihitung TERMASUK safe area atas, supaya logo tidak terjepit di perangkat berponi.
    <header className="z-20 flex shrink-0 min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between bg-bg/95 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
      <Link to="/" aria-label="MusicVerse, ke Beranda" className="focus-ring -ml-1 rounded-md p-1">
        <Logo />
      </Link>
      {/* Pintasan antrean: tampil hanya saat ada lagu, jadi tidak perlu membuka pemutar penuh dulu. */}
      {active && <QueueButton onClick={openQueue} size="lg" className="flex" />}
    </header>
  )
}
