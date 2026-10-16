import type { Cover } from '../types'
import { isSafeHttpUrl } from './spotifyUrl'

const SIZE = 512
const LOAD_TIMEOUT_MS = 8000
/** Diameter badge logo relatif terhadap sisi sampul. */
const BADGE_RATIO = 0.26
/** Jarak badge dari tepi pojok kanan bawah. */
const BADGE_MARGIN_RATIO = 0.04

/** Bar logo MusicVerse (sama dengan Logo.tsx / favicon.svg; viewBox 32x32). */
const LOGO_BARS: ReadonlyArray<[number, number, number, number]> = [
  [6, 14, 3.5, 8],
  [11.5, 9, 3.5, 18],
  [17, 5, 3.5, 22],
  [22.5, 11, 3.5, 12],
]

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // CORS wajib supaya canvas tidak "tainted" dan bisa diekspor. Tanpa header CORS dari host gambar, load gagal.
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    const timer = setTimeout(() => {
      img.src = ''
      reject(new Error('timeout'))
    }, LOAD_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('load'))
    }
    img.src = src
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawGradientCover(ctx: CanvasRenderingContext2D, cover: Cover) {
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  g.addColorStop(0, cover.from)
  g.addColorStop(1, cover.to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
}

/** Gambar persegi, dipotong tengah (setara object-cover). */
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const side = Math.min(w, h)
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE)
}

/** Lingkaran kecil berisi logo di pojok kanan bawah. */
function drawLogoBadge(ctx: CanvasRenderingContext2D) {
  const d = SIZE * BADGE_RATIO
  const margin = SIZE * BADGE_MARGIN_RATIO
  const cx = SIZE - margin - d / 2
  const cy = SIZE - margin - d / 2

  // Cincin gelap tipis supaya badge tetap terbaca di atas sampul apa pun.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = SIZE * 0.025
  ctx.fillStyle = '#121212'
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = SIZE * 0.006
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2 - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()

  const s = (d / 32) * 0.82
  ctx.fillStyle = '#1DB954'
  for (const [x, y, w, h] of LOGO_BARS) {
    roundedRect(ctx, cx + (x - 16) * s, cy + (y - 16) * s, w * s, h * s, (w * s) / 2)
    ctx.fill()
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/**
 * Membuat sampul notifikasi: sampul lagu + lingkaran kecil logo MusicVerse di pojok kanan bawah.
 * Mengembalikan blob URL (panggil `URL.revokeObjectURL` saat tak dipakai), atau null jika gagal.
 * Jika gambar sampul tidak bisa dimuat dengan CORS, dipakai gradient `cover` sebagai cadangan (logo tetap tampil).
 */
export async function composeNotificationCover(coverUrl: string | undefined, cover: Cover): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  let drewImage = false
  if (isSafeHttpUrl(coverUrl)) {
    try {
      drawCoverImage(ctx, await loadImage(coverUrl))
      drewImage = true
    } catch {
      // Gambar gagal dimuat / tanpa CORS: pakai gradient.
    }
  }
  if (!drewImage) drawGradientCover(ctx, cover)
  drawLogoBadge(ctx)

  const blob = await toBlob(canvas)
  return blob ? URL.createObjectURL(blob) : null
}
