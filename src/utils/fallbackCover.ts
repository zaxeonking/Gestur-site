import type { Cover, CoverShape } from '../types'

const PALETTES: Array<[string, string]> = [
  ['#1DB954', '#0b3d20'],
  ['#ff9a3c', '#8a2f12'],
  ['#4f7cff', '#10204f'],
  ['#ff4d6d', '#4a0f22'],
  ['#e8c547', '#5c4a08'],
  ['#9b5de5', '#2a0f4f'],
  ['#00c2b8', '#063f3c'],
  ['#f15bb5', '#4f0c37'],
]
const SHAPES: CoverShape[] = ['rings', 'bars', 'sun', 'dots']

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return h
}

/** Cover gradient yang konsisten per teks, dipakai saat gambar API kosong/gagal dimuat. */
export function fallbackCover(seed: string): Cover {
  const h = hash(seed)
  const [from, to] = PALETTES[h % PALETTES.length]
  return { from, to, shape: SHAPES[(h >> 3) % SHAPES.length] }
}
