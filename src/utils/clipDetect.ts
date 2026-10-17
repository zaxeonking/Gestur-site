/** Audio sepanjang ini atau kurang dianggap kandidat klip/cuplikan (bukan lagu penuh). */
export const CLIP_MAX_S = 35
/** Selisih minimal dengan durasi lagu yang diharapkan agar audio dianggap klip. */
export const CLIP_MIN_GAP_S = 20
/**
 * Audio yang jauh lebih pendek dari lagu aslinya (di bawah rasio ini) dengan selisih sekurang-kurangnya
 * CLIP_FAR_GAP_S dianggap salah lagu/cuplikan, walau lebih panjang dari CLIP_MAX_S
 * (mis. 0:43 untuk lagu 3:16).
 */
export const CLIP_MAX_RATIO = 0.6
export const CLIP_FAR_GAP_S = 45

/**
 * Apakah audio yang benar-benar termuat (`actual`, detik) hanyalah klip/cuplikan dari lagu
 * yang seharusnya lebih panjang (`expected`, detik dari data playlist)?
 * Durasi di metadata API tidak bisa dipercaya untuk ini (selalu durasi lagu asli),
 * jadi yang dibandingkan adalah durasi file audio sebenarnya dari elemen <audio>.
 */
export function isLikelyClip(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) return false
  if (!Number.isFinite(actual) || actual <= 0) return false
  const gap = expected - actual
  if (actual <= CLIP_MAX_S && gap >= CLIP_MIN_GAP_S) return true
  return actual < expected * CLIP_MAX_RATIO && gap >= CLIP_FAR_GAP_S
}
