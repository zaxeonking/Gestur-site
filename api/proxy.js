// Proxy server-side ke API pihak ketiga (menghindari CORS di browser).
// Dipanggil lewat rewrite di vercel.json: /nexa/<path>?<query>  ->  /api/proxy?path=<path>&<query>
const UPSTREAM = 'https://api.nexadev.my.id'
const ALLOWED = ['api/spotifypl', 'api/spotifyplay']
const TIMEOUT_MS = 25000

export default async function handler(req, res) {
  const incoming = new URL(req.url, 'http://localhost')
  const path = (incoming.searchParams.get('path') || '').replace(/^\/+/, '')
  incoming.searchParams.delete('path')

  if (!ALLOWED.includes(path)) {
    return res.status(404).json({ status: false, message: `Proxy: path tidak diizinkan (${path || 'kosong'}).` })
  }

  const target = `${UPSTREAM}/${path}${incoming.search}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MusicVerse/1.0)',
      },
      signal: controller.signal,
    })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(body)
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : error?.cause?.code || error?.message || 'unknown'
    return res.status(502).json({ status: false, message: `Proxy gagal menghubungi API (${reason}).` })
  } finally {
    clearTimeout(timer)
  }
}
