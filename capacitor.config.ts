import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Konfigurasi Capacitor untuk MusicVerse.
 * - webDir harus sama dengan output `vite build` (dist).
 * - Aplikasi dilayani dari https://localhost di dalam WebView (androidScheme: 'https').
 */
const config: CapacitorConfig = {
  appId: 'com.musicverse.app',
  appName: 'MusicVerse',
  webDir: 'dist',
  backgroundColor: '#121212',
  server: {
    androidScheme: 'https',
  },
  android: {
    // URL audio dari API bisa saja http://. Dari origin https://localhost, tanpa ini
    // WebView memblokirnya sebagai mixed content. Matikan jika API terbukti selalu https.
    allowMixedContent: true,
  },
  plugins: {
    // Meneruskan fetch() lewat HTTP native sehingga tidak terkena CORS WebView.
    // Tanpa ini, request ke api.nexadev.my.id hanya jalan jika server mengirim
    // header CORS untuk origin https://localhost.
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
