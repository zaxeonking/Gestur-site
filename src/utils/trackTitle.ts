import { normalizeSearchText } from './trackSearch'

function plain(value: string): string {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function artistList(artists: string): string[] {
  return normalizeSearchText(artists)
    .split(/\s*(?:,|&|;| feat\.? | ft\.? | and | x )\s*/)
    .map(plain)
    .filter(Boolean)
}

function isArtist(part: string, names: string[]): boolean {
  const p = plain(part)
  if (!p) return false
  return names.some((n) => p === n || (p.length >= 3 && n.includes(p)) || (n.length >= 3 && p.includes(n)))
}

/**
 * Judul di playlist sering berformat "Artis - Judul" (atau "Judul - Artis"). Untuk pencarian audio/lirik,
 * bagian artis harus dibuang: "Vierra - Kesepian" (artis Vierra) -> "Kesepian". Bagian lain di sekitar " - "
 * (mis. "Judul - Remastered 2011") tidak disentuh, dan jika tidak ada bagian yang cocok dengan artis,
 * judul dikembalikan apa adanya.
 */
export function stripArtistPrefix(title: string, artists: string): string {
  const trimmed = title.trim()
  const names = artistList(artists)
  if (names.length === 0) return trimmed
  const first = trimmed.indexOf(' - ')
  if (first > 0) {
    const rest = trimmed.slice(first + 3).trim()
    if (rest && isArtist(trimmed.slice(0, first), names)) return rest
  }
  const last = trimmed.lastIndexOf(' - ')
  if (last > 0) {
    const head = trimmed.slice(0, last).trim()
    if (head && isArtist(trimmed.slice(last + 3), names)) return head
  }
  return trimmed
}
