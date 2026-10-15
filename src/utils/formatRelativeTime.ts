/** Waktu relatif singkat dalam bahasa Indonesia: "Baru saja", "5 mnt lalu", "Kemarin", "12 Okt". */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const seconds = Math.floor((now - timestamp) / 1000)
  if (seconds < 60) return 'Baru saja' // termasuk waktu di masa depan (jam perangkat bergeser)
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} mnt lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Kemarin'
  if (days < 7) return `${days} hari lalu`

  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
