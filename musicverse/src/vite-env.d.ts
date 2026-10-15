/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL API. Default: https://api.nexadev.my.id */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
