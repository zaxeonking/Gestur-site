/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL API. Default: https://api.nexadev.my.id */
  readonly VITE_API_BASE_URL?: string
  /** Base URL API download (berbasis tautan lagu). Default: https://app.kyzznekoo.my.id, atau /kyzz jika VITE_API_BASE_URL=/nexa */
  readonly VITE_DOWNLOAD_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
