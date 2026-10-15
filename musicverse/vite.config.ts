import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Opsional: jika browser memblokir request karena CORS saat development,
    // set VITE_API_BASE_URL=/nexa di .env.local agar request lewat proxy ini.
    proxy: {
      '/nexa': {
        target: 'https://api.nexadev.my.id',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nexa/, ''),
      },
    },
  },
})
