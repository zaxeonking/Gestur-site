/** Satu baris lirik bertanda waktu (detik dari awal lagu). */
export interface LyricLine {
  time: number
  text: string
}

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

/**
 * Mengurai format LRC: `[mm:ss.xx] teks`. Satu baris boleh punya beberapa stempel waktu, tag
 * metadata (`[ar:...]`, `[ti:...]`) dilewati, hasil diurutkan menurut waktu. Teks kosong dipertahankan
 * (jeda instrumental) supaya sorotan baris tidak "menggantung" di baris sebelumnya.
 */
export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const row of raw.split(/\r?\n/)) {
    const times: number[] = []
    let lastEnd = 0
    STAMP.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = STAMP.exec(row)) !== null) {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      times.push(Number(match[1]) * 60 + Number(match[2]) + fraction)
      lastEnd = STAMP.lastIndex
    }
    if (times.length === 0) continue
    const text = row.slice(lastEnd).trim()
    for (const time of times) lines.push({ time, text })
  }
  // Array.prototype.sort stabil: baris dengan waktu sama tetap berurutan seperti di file.
  return lines.sort((a, b) => a.time - b.time)
}

/**
 * Indeks baris yang sedang dinyanyikan pada waktu `time`: baris terakhir yang waktunya <= time.
 * -1 jika belum sampai baris pertama.
 */
export function findActiveLine(lines: readonly LyricLine[], time: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}
