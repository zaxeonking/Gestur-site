import { Link2, Loader2, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { usePlaylist } from '../../context/PlaylistContext'
import { validateSpotifyPlaylistUrl } from '../../utils/spotifyUrl'

export default function PlaylistImportForm() {
  const { status, isLive, loadPlaylist, reset } = usePlaylist()
  const [value, setValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const loading = status === 'loading'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const result = validateSpotifyPlaylistUrl(value)
    if (!result.valid) {
      setValidationError(result.message)
      return
    }
    setValidationError(null)
    await loadPlaylist(value)
  }

  function handleReset() {
    reset()
    setValue('')
    setValidationError(null)
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="space-y-2" aria-label="Impor playlist Spotify">
      <label htmlFor={inputId} className="sr-only">
        Tautan playlist Spotify
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (validationError) setValidationError(null)
            }}
            placeholder="Tempel tautan playlist Spotify"
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
            {loading ? 'Memuat…' : 'Muat playlist'}
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
