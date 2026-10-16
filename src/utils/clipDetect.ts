/** Audio sepanjang ini atau kurang dianggap kandidat klip/cuplikan (bukan lagu penuh). */
export const CLIP_MAX_S = 35
/** Selisih minimal dengan durasi lagu yang diharapkan agar audio dianggap klip. */
export const CLIP_MIN_GAP_S = 20

/**
 * Apakah audio yang benar-benar termuat (`actual`, detik) hanyalah klip/cuplikan dari lagu
 * yang seharusnya lebih panjang (`expected`, detik dari data playlist)?
 * Durasi di metadata API tidak bisa dipercaya untuk ini (selalu durasi lagu asli),
 * jadi yang dibandingkan adalah durasi file audio sebenarnya dari elemen <audio>.
 */
export function isLikelyClip(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) return false
  if (!Number.isFinite(actual) || actual <= 0) return false
  return actual <= CLIP_MAX_S && expected - actual >= CLIP_MIN_GAP_S
}
