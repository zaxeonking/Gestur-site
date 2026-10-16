/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL API. Default: https://api.nexadev.my.id */
  readonly VITE_API_BASE_URL?: string
  /** Base URL API download (berbasis tautan lagu). Default: https://app.kyzznekoo.my.id, atau /kyzz jika VITE_API_BASE_URL=/nexa */
  readonly VITE_DOWNLOAD_API_BASE_URL?: string
  /** Base URL NetEase untuk lirik. Default: /netease (proxy) di web, https://music.163.com di APK. */
  readonly VITE_LYRICS_NETEASE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
