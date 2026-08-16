# Show me your hand — gesture experience

Website interaktif berbasis gesture tangan (real-time, via kamera), dibangun dengan HTML/CSS/JS murni + MediaPipe Tasks Vision (`HandLandmarker` + `FaceLandmarker`).

## Menjalankan

Butuh HTTPS atau `localhost` (browser mewajibkan secure context untuk kamera). Cara termudah:

```bash
cd gesture-site
python3 -m http.server 8080
# buka http://localhost:8080
```

Atau `npx serve .`, atau deploy ke Netlify/Vercel/GitHub Pages.

## Gesture

| Gesture | Aksi |
|---|---|
| ✌️ Peace (telunjuk + tengah terbuka) | Foto jadi blur (tanpa audio) |
| 🤚 Open palm (5 jari terbuka) | Teks "Halo" muncul |
| 👌 OK (jempol+telunjuk pinch, 3 jari lain terbuka) | Musik "Foto Kita Blur" mulai diputar (loop) |
| 👊 Fist (semua jari terkepal) | Musik berhenti |

Setiap gesture punya cooldown/debounce (lihat `STABLE_FRAMES_NEEDED` dan `AUDIO_COOLDOWN_MS` di `script.js`) supaya tidak trigger berulang tiap frame.

## Mengganti assets

- **Audio**: taruh file MP3 asli di:
  - `assets/audio/foto-kita-blur.mp3` (satu-satunya musik, dikontrol via gesture 👌 play / 👊 stop, otomatis loop selama diputar)

  Path ini sudah dipasang di `index.html` (`<audio>` tag) — tinggal timpa filenya. Kalau file belum ada, audio akan gagal diam-diam (tidak crash) dan tombol **"Enable Sound"** akan muncul saat autoplay diblokir browser.

- **Foto utama**: saat ini foto berupa placeholder gradient sinematik (CSS, di `.photo` dalam `style.css`) supaya project langsung bisa dijalankan tanpa aset tambahan. Untuk pakai foto asli, tambahkan di `script.js`:
  ```js
  el.photo.style.backgroundImage = "url('assets/images/main-photo.jpg')";
  el.photo.style.backgroundSize = "cover";
  el.photo.style.backgroundPosition = "center";
  ```
  lalu taruh file di `assets/images/main-photo.jpg`.

## Struktur

```
index.html
style.css
script.js
assets/
  audio/
  images/
```

## Catatan teknis

- Model MediaPipe (`HandLandmarker`) dimuat dari CDN (`@mediapipe/tasks-vision@0.10.14`) — butuh koneksi internet saat load pertama. Tidak lagi menggunakan `FaceLandmarker` (fitur shush sudah dihapus).
- Kamera & model baru diminta setelah user menekan **Start Experience** (menghindari block autoplay/permission oleh browser).
- Deteksi jari pakai perbandingan jarak tip↔wrist vs pip↔wrist (bukan cuma sumbu-Y), jadi cukup tahan terhadap kemiringan tangan.
- 👌 OK dideteksi dari jarak ujung jempol↔telunjuk yang kecil (pinch) relatif terhadap ukuran tangan, ditambah jari tengah/manis/kelingking harus terbuka (membedakan dari kepalan/fist).
