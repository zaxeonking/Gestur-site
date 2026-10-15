import { Link2, Loader2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { usePlaylist } from '../../context/PlaylistContext'
import { classifyImportInput, getLiveLoadTarget, validateSpotifyPlaylistUrl } from '../../utils/spotifyUrl'

/** Jeda setelah berhenti mengetik sebelum pencarian otomatis jalan. */
const LIVE_SEARCH_DEBOUNCE_MS = 700

const sameQuery = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ')

export default function PlaylistImportForm() {
  const { status, isLive, loadPlaylist, reset } = usePlaylist()
  const [value, setValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const loading = status === 'loading'
  const isSearch = classifyImportInput(value).kind === 'search'
  /** Teks terakhir yang sudah dimuat (otomatis atau lewat tombol), agar tidak diulang. */
  const lastLoadedRef = useRef<string | null>(null)

  // Pencarian langsung: muat otomatis setelah pengguna berhenti mengetik.
  useEffect(() => {
    const target = getLiveLoadTarget(value)
    if (!target) return
    const timer = setTimeout(() => {
      if (lastLoadedRef.current !== null && sameQuery(lastLoadedRef.current, target)) return
      lastLoadedRef.current = target
      setValidationError(null)
      void loadPlaylist(target)
    }, LIVE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, loadPlaylist])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const input = classifyImportInput(value)
    if (input.kind === 'empty') {
      setValidationError('Ketik judul lagu atau tempel tautan playlist Spotify.')
      return
    }
    if (input.kind === 'playlist') {
      const result = validateSpotifyPlaylistUrl(value)
      if (!result.valid) {
        setValidationError(result.message)
        return
      }
    }
    setValidationError(null)
    lastLoadedRef.current = value.trim()
    await loadPlaylist(value)
  }

  function handleReset() {
    reset()
    setValue('')
    setValidationError(null)
    lastLoadedRef.current = null
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="space-y-2" aria-label="Impor playlist Spotify">
      <label htmlFor={inputId} className="sr-only">
        Judul lagu atau tautan playlist Spotify
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (validationError) setValidationError(null)
            }}
            placeholder="Judul lagu atau tautan playlist Spotify"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? errorId : undefined}
            className={`h-12 w-full rounded-full bg-raised pl-12 pr-4 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
              validationError ? 'ring-2 ring-danger focus:ring-danger' : 'focus:ring-accent'
            }`}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary h-12 flex-1 px-6 text-base sm:flex-none"
          >
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            {loading ? 'Memuat…' : isSearch ? 'Cari lagu' : 'Muat playlist'}
          </button>
          {isLive && (
            <button
              type="button"
              onClick={handleReset}
              aria-label="Hapus playlist yang dimuat"
              className="icon-btn h-12 w-12 bg-raised"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {validationError && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {validationError}
        </p>
      )}
    </form>
  )
}
