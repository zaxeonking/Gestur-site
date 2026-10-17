/**
 * Membaca durasi sebenarnya dari file audio (hanya metadata, tanpa memutar) lewat elemen <audio> sementara.
 * Mengembalikan null jika metadata tidak muncul dalam `timeoutMs`, gagal dimuat, atau durasinya tak terhingga.
 */
export function probeAudioDuration(url: string, timeoutMs = 7000, signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') return resolve(null)
    const audio = new Audio()
    audio.preload = 'metadata'
    let done = false
    const finish = (value: number | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('error', onError)
      audio.removeAttribute('src')
      audio.load()
      resolve(value)
    }
    const onMeta = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null)
    const onError = () => finish(null)
    const onAbort = () => finish(null)
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
    audio.src = url
  })
}
