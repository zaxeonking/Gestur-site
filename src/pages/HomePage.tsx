import PlaylistImportForm from '../components/playlist/PlaylistImportForm'
import PlaylistView from '../components/playlist/PlaylistView'
import { useGreeting } from '../hooks/greeting'

export default function HomePage() {
  const greeting = useGreeting()

  return (
    <div className="space-y-8">
      <section aria-labelledby="home-title" className="space-y-5">
        <div>
          <h1
            id="home-title"
            className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl"
          >
            {greeting}
          </h1>
          <p className="mt-1 text-ink-muted">
            Cari lagu lewat judul, atau tempel tautan playlist Spotify.
          </p>
        </div>
        <PlaylistImportForm />
      </section>

      <PlaylistView />
    </div>
  )
}
