import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_MY_PLAYLIST_NAME } from '../../utils/myPlaylistStorage'

interface NewPlaylistFormProps {
  /** Mengembalikan teks error jika gagal (form tetap terbuka), atau null jika berhasil. */
  onCreate: (name: string) => string | null
  onCancel?: () => void
  autoFocus?: boolean
  submitLabel?: string
}

/** Isian nama + tombol Buat untuk playlist baru. Dipakai di halaman Koleksi dan menu "Simpan ke playlist". */
export default function NewPlaylistForm({ onCreate, onCancel, autoFocus = true, submitLabel = 'Buat' }: NewPlaylistFormProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') {
      setError('Isi nama playlist dulu.')
      return
    }
    const message = onCreate(name)
    if (message) setError(message)
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-2">
        <label htmlFor="new-playlist-name" className="sr-only">
          Nama playlist
        </label>
        <input
          ref={inputRef}
          id="new-playlist-name"
          type="text"
          value={name}
          maxLength={MAX_MY_PLAYLIST_NAME}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="Nama playlist"
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? 'new-playlist-error' : undefined}
          className="h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button type="submit" className="btn-primary h-11 px-5 text-sm">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary h-11 px-4 text-sm">
            Batal
          </button>
        )}
      </div>
      {error && (
        <p id="new-playlist-error" role="alert" className="mt-1.5 pl-4 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
