import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { AudioPlayerProvider } from './context/AudioPlayerContext'
import { LibraryProvider } from './context/LibraryContext'
import { PlaylistProvider } from './context/PlaylistContext'
import HomePage from './pages/HomePage'
import LibraryPage from './pages/LibraryPage'
import SearchPage from './pages/SearchPage'

const router = createBrowserRouter([
  {
    element: <AppShell />,
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
          <RouterProvider router={router} />
        </LibraryProvider>
      </AudioPlayerProvider>
    </PlaylistProvider>
  )
}
