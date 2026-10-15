/**
 * Pembungkus localStorage yang tidak pernah melempar error. Mengakses `window.localStorage`
 * saja bisa melempar (mode privat, cookie/situs diblokir), jadi semua akses ada di dalam try/catch
 * dan hasilnya dikelompokkan supaya pemanggil bisa memberi tahu pengguna dengan jujur.
 */

export type ReadOutcome =
  | { status: 'ok'; value: unknown }
  /** Kunci belum pernah ditulis. */
  | { status: 'empty' }
  /** Ada isinya tetapi bukan JSON yang valid. */
  | { status: 'corrupt' }
  /** localStorage tidak bisa diakses sama sekali. */
  | { status: 'unavailable' }

export type WriteFailure = 'quota' | 'unavailable'
export type WriteOutcome = { ok: true } | { ok: false; reason: WriteFailure }

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException === 'undefined' || !(error instanceof DOMException)) return false
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

export function readJson(key: string): ReadOutcome {
  const storage = getStorage()
  if (!storage) return { status: 'unavailable' }

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { status: 'unavailable' }
  }
  if (raw === null) return { status: 'empty' }

  try {
    return { status: 'ok', value: JSON.parse(raw) as unknown }
  } catch {
    return { status: 'corrupt' }
  }
}

export function writeJson(key: string, value: unknown): WriteOutcome {
  const storage = getStorage()
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    storage.setItem(key, JSON.stringify(value))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' }
  }
}

export function removeKey(key: string): void {
  try {
    getStorage()?.removeItem(key)
  } catch {
    // diabaikan: tidak ada yang bisa dilakukan jika penyimpanan diblokir
  }
}
