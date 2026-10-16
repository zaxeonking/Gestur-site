// Proxy server-side ke API pihak ketiga (menghindari CORS di browser).
// vercel.json: /nexa/<path>  -> /api/proxy?upstream=nexa&path=<path>
//              /kyzz/<path>  -> /api/proxy?upstream=kyzz&path=<path>
//              /netease/<path> -> /api/proxy?upstream=netease&path=<path>
const UPSTREAMS = {
  nexa: { base: 'https://api.nexadev.my.id', allowed: ['api/spotifypl', 'api/spotifyplay', 'api/spotify'] },
  kyzz: { base: 'https://app.kyzznekoo.my.id', allowed: ['api/download/spotify'] },
  // Lirik NetEase (bertanda waktu). Butuh header Referer agar tidak ditolak.
  netease: {
    base: 'https://music.163.com',
    allowed: ['api/search/get', 'api/song/lyric'],
    headers: { Referer: 'https://music.163.com/' },
  },
}
const TIMEOUT_MS = 25000
// Cloudflare 52x (mis. 525 SSL handshake) dan 502-504 sering sementara / tergantung edge: coba ulang.
const RETRY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527])
const MAX_ATTEMPTS = 3
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    let response
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      response = await fetch(target, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          ...(upstream.headers || {}),
        },
        signal: controller.signal,
      })
      if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) break
      await sleep(600 * attempt)
    }
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
