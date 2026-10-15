import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AudioPlayerProvider } from './context/AudioPlayerContext'
import { LibraryProvider } from './context/LibraryContext'
import { PlayerUiProvider } from './context/PlayerUiContext'
import { PlaylistProvider } from './context/PlaylistContext'
import { TrackMenuProvider } from './context/TrackMenuContext'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
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
      { path: '*', element: <HomePage /> },
    ],
  },
])

export default function App() {
  return (
    <PlaylistProvider>
      <AudioPlayerProvider>
        <LibraryProvider>
          <TrackMenuProvider>
            <RouterProvider router={router} />
          </TrackMenuProvider>
        </LibraryProvider>
      </AudioPlayerProvider>
    </PlaylistProvider>
  )
}
