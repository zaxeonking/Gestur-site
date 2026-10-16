import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import MediaSessionSync from './components/player/MediaSessionSync'
import { AudioPlayerProvider } from './context/AudioPlayerContext'
import { LibraryProvider } from './context/LibraryContext'
import { MyPlaylistsProvider } from './context/MyPlaylistsContext'
import { PlayerUiProvider } from './context/PlayerUiContext'
import { PlaylistProvider } from './context/PlaylistContext'
import { SleepTimerProvider } from './context/SleepTimerContext'
import { TrackMenuProvider } from './context/TrackMenuContext'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
import MyPlaylistPage from './pages/MyPlaylistPage'
import SearchPage from './pages/SearchPage'

const router = createBrowserRouter([
  {
    element: (
      <PlayerUiProvider>
        <AppShell />
      </PlayerUiProvider>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/my/:id', element: <MyPlaylistPage /> },
      { path: '*', element: <HomePage /> },
    ],
  },
])

export default function App() {
  return (
    <PlaylistProvider>
      <AudioPlayerProvider>
        <LibraryProvider>
          <MyPlaylistsProvider>
            <TrackMenuProvider>
              <SleepTimerProvider>
                <MediaSessionSync />
                <RouterProvider router={router} />
              </SleepTimerProvider>
            </TrackMenuProvider>
          </MyPlaylistsProvider>
        </LibraryProvider>
      </AudioPlayerProvider>
    </PlaylistProvider>
  )
}
