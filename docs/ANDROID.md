# MusicVerse di Android (Capacitor)

> **Status: DISIAPKAN, BELUM DIBUILD.** Konfigurasi dan dokumentasi ini ditulis tanpa
> menjalankan `npm install`, `npx cap add android`, maupun Gradle (lingkungan penyusun tidak
> punya jaringan dan Android SDK). Tidak ada APK yang pernah dihasilkan atau diuji.
> Semua langkah di bawah harus Anda jalankan sendiri; centang daftar uji di bagian 7.

## 1. Hasil pemeriksaan kompatibilitas (dari membaca kode)

| Area | Temuan | Risiko |
|---|---|---|
| Bundler | Vite 5 + React 18, output statis ke `dist/`, `base` default `/` | Rendah, cocok dengan `webDir: dist` |
| Routing | `createBrowserRouter`, tidak ada deep link; app selalu mulai dari `/` | Rendah. Jika ada masalah saat reload di rute dalam, ganti ke `createHashRouter` |
| Storage | `localStorage` lewat `safeStorage` (try/catch) | Rendah. Data tersimpan di WebView; hilang jika data aplikasi dihapus |
| API | `fetch` ke `https://api.nexadev.my.id` (`VITE_API_BASE_URL`) | **Sedang**: origin app menjadi `https://localhost`, jadi butuh CORS dari server atau `CapacitorHttp` (sudah diaktifkan di config, belum teruji) |
| API download (`app.kyzznekoo.my.id`) | API utama (NexaDev `/api/spotify` jadi cadangannya) untuk memutar lagu lewat tautan Spotify-nya. Di APK diakses langsung (`CapacitorHttp`); CORS-nya belum diuji. Nama parameter (`url`) adalah asumsi, lihat `DOWNLOAD_URL_PARAM` di `spotifyApi.ts` | **Sedang** |
| Proxy Vite `/nexa` | Hanya ada di dev server | **Jangan** set `VITE_API_BASE_URL=/nexa` (atau `/kyzz`) untuk build Android; tidak ada proxy di APK |
| Audio | Satu `HTMLAudioElement`, tanpa `crossOrigin`, trik `prime()` untuk autoplay | Sedang: URL audio `http://` butuh `allowMixedContent` (sudah diaktifkan) |
| Audio di latar belakang | Tidak ada MediaSession, foreground service, atau notifikasi kontrol | **Tinggi**: musik bisa berhenti saat layar mati / app di latar belakang. Perlu dites; solusi andal butuh plugin native |
| Tombol Back | `FullPlayer` dan `QueuePanel` adalah state React lokal, tidak terhubung ke riwayat | Sedang: Back dapat menutup app alih-alih menutup panel |
| Font | Google Fonts dimuat dari internet | Rendah: offline jatuh ke font sistem (sudah ada fallback di Tailwind) |
| Safe area | Sudah memakai `env(safe-area-inset-*)` dan `viewport-fit=cover` | Rendah; cek tampilan status bar/gesture bar di perangkat |

## 2. Prasyarat

- Node.js 22+ (cek persyaratan versi Capacitor terbaru di <https://capacitorjs.com/docs/getting-started/environment-setup>)
- JDK 21
- Android Studio (termasuk Android SDK + platform-tools), lalu set `ANDROID_HOME`
  dan tambahkan `$ANDROID_HOME/platform-tools` ke `PATH`
- Perangkat Android dengan Opsi Pengembang dan USB debugging aktif

Cek otomatis: `npm run android:check`

## 3. Instalasi (sekali saja)

```bash
npm install
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap add android
```

`capacitor.config.ts` sudah tersedia (appId `com.musicverse.app`, webDir `dist`).
Ubah `appId` sebelum `cap add android` jika ingin ID paket sendiri; mengubahnya sesudahnya
perlu penyesuaian manual di folder `android/`.

## 4. Konfigurasi Android

Setelah `cap add android`, periksa di `android/`:

1. `app/src/main/AndroidManifest.xml` harus memuat izin internet (biasanya sudah ada):
   `<uses-permission android:name="android.permission.INTERNET" />`
2. `app/build.gradle`: `minSdkVersion`/`targetSdkVersion` mengikuti template Capacitor; jangan diturunkan.
3. Ikon dan splash: ganti ikon di `app/src/main/res/mipmap-*`
   (atau gunakan `@capacitor/assets`; belum disiapkan di project ini).
4. Jika API terbukti selalu `https`, set `allowMixedContent: false` di `capacitor.config.ts`.

## 5. Build

```bash
npm run android:sync     # vite build + cap sync android
npm run android:open     # buka Android Studio, lalu Run / Build APK
# atau lewat terminal:
npm run android:apk      # hasil: android/app/build/outputs/apk/debug/app-debug.apk
```

Setiap kali kode web berubah, jalankan ulang `npm run android:sync`.

APK **debug** cukup untuk uji di perangkat. Untuk rilis, buat keystore
(`keytool -genkey -v -keystore musicverse.jks -alias musicverse -keyalg RSA -keysize 2048 -validity 10000`),
simpan di luar repo, lalu gunakan Build → Generate Signed Bundle / APK di Android Studio.

## 6. Menjalankan di perangkat nyata

```bash
adb devices                 # perangkat harus berstatus "device"
npm run android:run         # build, sync, install, dan jalankan
# atau pasang APK manual:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Debug WebView: buka `chrome://inspect` di Chrome desktop saat perangkat terhubung.

## 7. Daftar uji di perangkat (belum ada yang dijalankan)

- [ ] App terbuka, tema gelap dan font tampil; status bar/gesture bar tidak menutupi header, BottomNav, atau MiniPlayer
- [ ] Impor playlist Spotify publik berhasil (menguji API/CORS/`CapacitorHttp`)
- [ ] Putar lagu: audio keluar, seek bar bergerak, next/prev/shuffle/repeat bekerja
- [ ] Audio tetap jalan saat layar dikunci dan saat pindah app (**kemungkinan gagal**, lihat bagian 8)
- [ ] Tombol Back saat FullPlayer/QueuePanel terbuka
- [ ] Library, riwayat putar, dan playlist tersimpan setelah app ditutup paksa lalu dibuka lagi
- [ ] Mode pesawat: pesan error tampil jelas, app tidak crash
- [ ] Rotasi layar dan layar kecil

## 8. Masalah yang diperkirakan

1. **Pemutaran di latar belakang**: butuh plugin media-session/foreground service native; tidak disertakan.
2. **Tombol Back**: perlu `@capacitor/app` (`App.addListener('backButton', …)`) dan penutupan panel; belum diimplementasikan.
3. **CORS/API**: jika `CapacitorHttp` tidak cukup, minta server mengizinkan origin `https://localhost`.
4. **Ketergantungan layanan pihak ketiga**: app bergantung pada `api.nexadev.my.id`; jika layanan itu mati, impor dan pemutaran gagal.
