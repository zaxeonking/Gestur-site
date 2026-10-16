/** 83.4 → "1:23". Nilai tidak valid menjadi "0:00". */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** "3:05" → 185, "1:02:03" → 3723. Teks kosong atau tidak valid → null. */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null
  const parts = text.trim().split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const total = parts.reduce((sum, p) => sum * 60 + Number(p), 0)
  return total > 0 ? total : null
}
