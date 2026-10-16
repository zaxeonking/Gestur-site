import { ClipboardPaste, Link2, Loader2, X } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { usePlaylist } from '../../context/PlaylistContext'
import { classifyImportInput, validateSpotifyPlaylistUrl } from '../../utils/spotifyUrl'

export default function PlaylistImportForm() {
  const { status, loadPlaylist, reset } = usePlaylist()
  const [value, setValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const loading = status === 'loading'
  const inputKind = classifyImportInput(value).kind
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const input = classifyImportInput(value)
    if (input.kind === 'empty') {
      setValidationError('Ketik judul lagu, atau tempel tautan lagu/playlist Spotify.')
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
    await loadPlaylist(value)
  }

  /** Kosongkan input dan langsung kembali ke beranda: batalkan permintaan yang berjalan, hapus hasil. */
  function handleReset() {
    reset()
    setValue('')
    setValidationError(null)
  }

  /** Tempel teks dari clipboard; pencarian tetap manual (tekan tombol/Enter). */
  async function handlePaste() {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (!text) {
        setValidationError('Clipboard kosong. Salin judul atau tautan lagu dulu.')
        return
      }
      setValue(text)
      setValidationError(null)
      inputRef.current?.focus()
    } catch {
      setValidationError('Tidak bisa membaca clipboard. Izinkan akses tempel, atau tempel manual di kolom ini.')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={loading} className="space-y-2" aria-label="Impor playlist Spotify">
      <label htmlFor={inputId} className="sr-only">
        Judul lagu, tautan lagu, atau tautan playlist Spotify
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={value}
            onChange={(e) => {
              const next = e.target.value
              if (next.trim() === '') {
                // Dihapus sampai kosong: tidak mungkin ada hasil, jadi langsung kembali tanpa menunggu.
                handleReset()
                return
              }
              setValue(next)
              if (validationError) setValidationError(null)
            }}
            placeholder="Judul lagu, tautan lagu, atau tautan playlist"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? errorId : undefined}
            className={`h-12 w-full rounded-full bg-raised pl-12 pr-14 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
              validationError ? 'ring-2 ring-danger focus:ring-danger' : 'focus:ring-accent'
            }`}
          />
          {value.length > 0 ? (
            <button
              type="button"
              onClick={handleReset}
              aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink active:bg-white/10 focus-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handlePaste()}
              aria-label="Tempel dari clipboard"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink active:bg-white/10 focus-ring"
            >
              <ClipboardPaste className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
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
            {loading ? 'Memuat…' : inputKind === 'playlist' ? 'Muat playlist' : inputKind === 'track' ? 'Muat lagu' : 'Cari lagu'}
          </button>
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
