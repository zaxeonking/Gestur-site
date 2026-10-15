// Proxy server-side ke API pihak ketiga (menghindari CORS di browser).
// vercel.json: /nexa/<path>  -> /api/proxy?upstream=nexa&path=<path>
//              /kyzz/<path>  -> /api/proxy?upstream=kyzz&path=<path>
const UPSTREAMS = {
  nexa: { base: 'https://api.nexadev.my.id', allowed: ['api/spotifypl', 'api/spotifyplay', 'api/spotify'] },
  kyzz: { base: 'https://app.kyzznekoo.my.id', allowed: ['api/download/spotify'] },
}
const TIMEOUT_MS = 25000

export default async function handler(req, res) {
  const incoming = new URL(req.url, 'http://localhost')
  const upstream = UPSTREAMS[incoming.searchParams.get('upstream') || 'nexa']
  const path = (incoming.searchParams.get('path') || '').replace(/^\/+/, '')
  incoming.searchParams.delete('upstream')
  incoming.searchParams.delete('path')

  if (!upstream || !upstream.allowed.includes(path)) {
    return res.status(404).json({ status: false, message: `Proxy: path tidak diizinkan (${path || 'kosong'}).` })
  }

  const target = `${upstream.base}/${path}${incoming.search}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MusicVerse/1.0)',
      },
      signal: controller.signal,
    })
    const body = await response.text()
    res.status(response.status)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(body)
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : error?.cause?.code || error?.message || 'unknown'
    return res.status(502).json({ status: false, message: `Proxy gagal menghubungi API (${reason}).` })
  } finally {
    clearTimeout(timer)
  }
}
