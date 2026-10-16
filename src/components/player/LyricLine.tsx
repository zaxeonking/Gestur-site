import { Music2 } from 'lucide-react'

interface LyricLineProps {
  /** Baris lirik yang sedang berjalan. Kosong/undefined = tampilkan teks pengganti. */
  text?: string | null
}

/**
 * Kotak kecil di atas mini player untuk lirik berjalan. WAJIB satu baris: teks tidak pernah membungkus,
 * baris yang kepanjangan dipotong dengan elipsis. Tinggi tetap supaya tata letak tidak bergeser.
 */
export default function LyricLine({ text }: LyricLineProps) {
  const line = text?.trim()
  return (
    <div
      aria-live="off"
      className="mx-auto flex h-9 w-full max-w-md items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.08] px-4 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 [-webkit-backdrop-filter:blur(24px)_saturate(150%)]"
    >
      <Music2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <p className={`min-w-0 flex-1 truncate whitespace-nowrap text-center text-sm ${line ? 'font-medium text-ink' : 'text-ink-muted'}`}>
        {line || 'Lirik akan tampil di sini'}
      </p>
    </div>
  )
}
