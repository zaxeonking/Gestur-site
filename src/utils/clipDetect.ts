/** Audio sepanjang ini atau kurang dianggap kandidat klip/cuplikan (bukan lagu penuh). */
export const CLIP_MAX_S = 35
/** Selisih minimal dengan durasi lagu yang diharapkan agar audio dianggap klip. */
export const CLIP_MIN_GAP_S = 20
/** Audio di bawah rasio ini dari durasi lagu (dengan selisih >= CLIP_FAR_GAP_S) dianggap salah lagu/cuplikan. */
export const CLIP_MAX_RATIO = 0.6
export const CLIP_FAR_GAP_S = 45
/** Audio yang lebih pendek dari lagu dengan selisih melebihi batas ini (detik atau persen, mana yang lebih besar) ditolak. */
export const SHORT_TOLERANCE_S = 25
export const SHORT_TOLERANCE_RATIO = 0.12

/**
 * Apakah audio yang benar-benar termuat (`actual`, detik) hanyalah klip/cuplikan atau lagu lain yang
 * jelas lebih pendek dari lagu yang seharusnya (`expected`, detik dari data playlist)?
 * Durasi di metadata API tidak bisa dipercaya untuk ini (sering durasi lagu asli), jadi yang
 * dibandingkan adalah durasi file audio sebenarnya.
 */
export function isLikelyClip(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null) return false
  if (!Number.isFinite(actual) || actual <= 0) return false
  const gap = expected - actual
  if (actual <= CLIP_MAX_S && gap >= CLIP_MIN_GAP_S) return true
  if (actual < expected * CLIP_MAX_RATIO && gap >= CLIP_FAR_GAP_S) return true
  return gap > Math.max(SHORT_TOLERANCE_S, expected * SHORT_TOLERANCE_RATIO)
}

/**
 * Kecocokan durasi audio sebenarnya dengan durasi lagu di playlist, 0..1 (null jika salah satu tidak diketahui).
 * 1 = selisih <= 5 dtk; 0.7 = <= 12 dtk atau 5%; 0.3 = <= 25 dtk atau 10%; selebihnya 0.
 */
export function durationFit(actual: number | null, expected: number | null): number | null {
  if (actual === null || expected === null) return null
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual <= 0 || expected <= 0) return null
  const diff = Math.abs(actual - expected)
  const rel = diff / expected
  if (diff <= 5) return 1
  if (diff <= 12 || rel <= 0.05) return 0.7
  if (diff <= 25 || rel <= 0.1) return 0.3
  return 0
}
