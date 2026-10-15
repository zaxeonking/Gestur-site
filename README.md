# MusicVerse

Web music player (tahap 1: layout, tahap 2: integrasi API playlist, tahap 3: daftar track, tahap 4: playback, tahap 5: MiniPlayer + FullPlayer, tahap 6: Queue + Play All, tahap 7: tampilan Queue + navigasi lagu, tahap 8: halaman Koleksi). React + Vite + TypeScript + Tailwind CSS + Lucide React.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build produksi
```

## Struktur

```
src/
  components/
    layout/   AppShell, Sidebar (desktop), BottomNav (mobile), MobileHeader
    playlist/ PlaylistImportForm, PlaylistView, PlaylistHeader, TrackList, TrackRow, PlaylistSkeleton
    library/  SavedPlaylistCard, RecentlyPlayedList
    music/    PlaylistCard, QuickPickCard, ArtistCard, TrackRow, GenreTile, HorizontalRow
    player/   PlayerDock, MiniPlayer, FullPlayer, QueuePanel, SeekBar, PlayerControls (TransportControls, QueueButton, SpotifyLink, PlayerError)
    ui/       CoverArt, Chip, Logo, SectionHeader, EmptyState
  config/     navigation.ts
  context/    PlaylistContext (state memuat/berhasil/gagal), AudioPlayerContext (satu pemilik audio engine), LibraryContext (Koleksi)
  services/   spotifyApi.ts (fetchPlaylist, fetchPlaybackInfo), audioEngine.ts (satu HTMLAudioElement)
  utils/      spotifyUrl.ts (validasi URL), fallbackCover, playlistMapper, trackSearch, playerQueue (fungsi murni queue),
              safeStorage + libraryStorage (penyimpanan Koleksi), formatRelativeTime
  data/       mock.ts (data sementara, diganti API nanti)
  hooks/      greeting.ts, useAudioPlayer (konsumen), useAudioPlayerController (logika), useNowPlaying (metadata lagu aktif)
  pages/      HomePage, SearchPage, LibraryPage
  types/      index.ts, spotify.ts (tipe respons API), library.ts (tipe Koleksi)
```

## Halaman Home

Home berisi sapaan sesuai jam lokal, input tautan playlist Spotify, tombol **Load Playlist**,
skeleton saat memuat, header playlist (cover, nama, jumlah lagu), pesan error dengan tombol **Retry**,
dan empty state saat belum ada playlist. Playlist terakhir yang berhasil dimuat disimpan di
`localStorage` (kunci `musicverse:last-playlist:v1`) dan ditampilkan lagi saat aplikasi dibuka.
Semua pemanggilan API lewat `fetchPlaylist` di `src/services/spotifyApi.ts`.

## Integrasi playlist

Endpoint: `GET {BASE}/api/spotifypl?url={ENCODED_URL}` (lihat `.env.example` untuk `VITE_API_BASE_URL`).
Selama ada playlist yang dimuat, data mock disembunyikan di Beranda, Cari, dan sidebar.
Tombol X di form menghapus playlist (termasuk cache).

## Daftar track (tahap 3)

- `PlaylistHeader`: cover, nama, jumlah lagu, tombol **Play All** (`onPlayAll(tracks)`), dan **Muat ulang**.
- `TrackList`: pencarian (judul, artis, album; tanpa pengaruh huruf besar/aksen; semua kata harus cocok),
  highlight lagu terpilih, dan state kosong/tanpa hasil.
- `TrackRow`: nomor, cover, judul (tautan ke Spotify), artis, album (mulai lebar `md`), durasi, tombol Play.
  Di mobile durasi dipindah ke baris artis agar kolom judul tidak sempit.
- Nomor urut dan `index` yang dikirim ke `onPlay(track, index)` adalah posisi asli di `playlist.tracks`,
  tidak berubah oleh filter. `track.id` berformat `{indeks}-{idLaguSpotify}`, unik walau lagu muncul dua kali.
- Hubungkan pemutar nanti lewat `<PlaylistView onPlay={...} onPlayAll={...} />`.
  Gunakan `playlist.tracks` sebagai queue dan `index` sebagai posisi awal.

## Playback (tahap 4)

Endpoint: `GET {BASE}/api/spotifyplay?q={encodeURIComponent(judul)}` → `data.mp3_url`.

- **Satu engine.** `services/audioEngine.ts` memegang satu `HTMLAudioElement`. `AudioPlayerProvider`
  (di dalam `PlaylistProvider`) memanggil `useAudioPlayerController` sekali. Komponen cukup memakai
  `useAudioPlayer()` (status + aksi), `usePlayerActions()`, atau `usePlaybackTime()`; jangan membuat `new Audio()` lain.
- **Aksi:** `playTrack(track, index)`, `selectTrack` (untuk tombol UI: lagu aktif di-jeda/lanjut, selain itu play),
  `togglePlayPause()`, `cleanup()`.
- **Status** hanya berubah lewat event audio: `idle → resolving → loading → playing ⇄ buffering / paused → ended`, atau `error`.
  `playing` baru diisi saat event `playing` diterima; respons `status: true` atau `play()` yang diterima belum cukup.
- **URL selalu baru.** Setiap `playTrack` meminta `mp3_url` ke endpoint; tidak ada cache. Dari `ended`/`error`,
  `togglePlayPause()` juga mengambil URL baru.
- **Error:** respons gagal / `mp3_url` kosong / bukan http(s), pemutaran diblokir browser, `MediaError` jaringan,
  dekode, atau format/URL tidak didukung (termasuk tautan kedaluwarsa dan halaman unduhan), serta batas 30 detik
  menunggu event `playing` pertama.
- **CORS:** elemen audio sengaja tanpa `crossOrigin`, jadi host audio mana pun bisa diputar tanpa header CORS.
  Permintaan ke API tetap butuh CORS (atau proxy `/nexa`, lihat `.env.example`).
- Playlist dihapus atau diganti → audio otomatis dihentikan.

Lagu berikutnya diputar otomatis saat lagu selesai (lihat tahap 6).

## MiniPlayer & FullPlayer (tahap 5)

`PlayerDock` (di `AppShell`) menampilkan `MiniPlayer` selama ada lagu aktif, dan `FullPlayer` saat mini player diklik.
Keduanya hanya membaca `useAudioPlayer()` / `usePlaybackTime()`; tidak ada state playback kedua, dan endpoint tidak berubah.
State UI satu-satunya yang baru adalah "full player terbuka" di `PlayerDock`.

- **Posisi.** Mobile: tepat di atas `BottomNav` (`bottom: 4rem + 1px + safe-area-inset-bottom`). Desktop: menempel di bawah,
  di kanan sidebar. Tinggi mini diekspos sebagai `--mini-player-h` agar `<main>` memberi padding bawah yang pas.
  Full player memakai `safe-area-inset-top/bottom` (index.html sudah `viewport-fit=cover`).
- **Aksi baru di audio engine:** `seekTo`, `playNext`, `playPrevious`, `retry`. Queue = `state.queue`, posisi = `currentIndex` (lihat tahap 6);
  `hasPrevious` / `hasNext` diturunkan dari keduanya. Previous mengulang dari 0:00 jika lagu sudah > 3 detik dan bisa di-seek.
- **Seek** hanya aktif bila `audio.duration` terhingga, `audio.seekable` tidak kosong, dan status playing/buffering/paused
  (`PlaybackTime.seekable`). Jika tidak, SeekBar hanya menampilkan progres (tanpa slider). Slider bisa dipakai dengan pointer dan keyboard;
  seek dikirim saat pointer dilepas / tombol panah dilepas / fokus hilang, bukan di setiap gerakan.
- **Tombol utama jujur.** Ikon Pause hanya setelah event `playing`. Saat `resolving`/`loading`/`buffering` tampil spinner;
  saat `error`/`ended` tampil ikon ulang (Retry / Putar ulang). Retry selalu meminta `mp3_url` baru.
- **Error:** pesan dari controller + tombol **Retry** di mini dan full player.
- **Tombol Spotify** memakai URL lagu dari playlist, lalu `spotify_url` dari endpoint play; hanya URL `open.spotify.com/track/…`
  yang valid. Jika tidak ada, tombol tidak dirender.
- **Listener:** SeekBar/Dock tidak memasang listener DOM sendiri; listener audio hanya di `AudioEngine` (dilepas di `dispose`),
  `ResizeObserver` MiniPlayer dan kunci scroll FullPlayer dibersihkan di cleanup effect.

## Queue & Play All (tahap 6)

Tidak ada library state baru: queue hidup di state yang sama dengan playback (`AudioPlayerState` di
`useAudioPlayerController`, dibagikan lewat `AudioPlayerContext`). Logika hitung ada di `utils/playerQueue.ts`
(fungsi murni: `getNextIndex`, `getPreviousIndex`, `hasNext`, `hasPrevious`, `resolveQueueForTrack`, `resolveQueueForPlayAll`).

- **State.** `state.queue: readonly PlaylistTrack[]` dan `state.currentIndex` (posisi di dalam `queue`) selalu diubah
  bersama dalam satu `commit` (`startPlayback`), jadi posisi playback tidak bisa lepas dari antreannya.
- **Pilih lagu** (`playTrack` / `selectTrack`): lagu langsung diputar dan queue = seluruh `playlist.tracks` aktif.
  Indeks dari UI dipercaya hanya jika id lagunya cocok; jika tidak dicari lewat id (lagu di luar playlist diputar sendirian).
  Filter pencarian di `TrackList` tidak memengaruhi queue.
- **Play All** (`playAll(tracks)`): queue = semua lagu yang diberikan, mulai dari lagu pertama.
- **Berurutan.** Saat event `ended`, lagu berikutnya otomatis diputar (URL audio diminta ulang seperti biasa).
  Di lagu terakhir pemutar berhenti di status `ended` (tidak mengulang dari awal).
- **Next/Previous/Retry** memakai queue yang sedang berjalan, bukan playlist saat ini, sehingga tetap konsisten
  walau playlist dimuat ulang dengan id yang sama. Playlist diganti/dihapus → `cleanup()` mengosongkan queue.
- Tidak ada perubahan tampilan; hanya tombol **Play All** yang kini memakai `playAll`.

## Tampilan Queue & navigasi (tahap 7)

- **QueuePanel** (`components/player/QueuePanel.tsx`): "Sedang diputar" + daftar "Berikutnya". Mobile berupa bottom sheet
  (maks. 85% tinggi layar), desktop (`lg`) panel di sisi kanan. Dialog modal: fokus masuk, Tab terkunci di dalam, Esc/backdrop/tombol X menutup.
  `PlayerDock` memegang state "queue terbuka" (di samping state "full player terbuka"); isi queue tidak punya state sendiri,
  hanya membaca `queue` + `currentIndex` dari `useAudioPlayer()`, jadi sinkron dengan MiniPlayer, FullPlayer, dan baris playlist.
- **Membuka queue:** tombol di header FullPlayer (semua ukuran), dan di MiniPlayer mulai lebar `sm` (di bawahnya ruang terlalu sempit;
  buka lewat full player).
- **Memilih lagu dari queue:** `playQueueItem(index)` melompat ke posisi itu di queue yang sedang berjalan (queue tidak diganti,
  tidak mencari ulang di playlist). Baris "Sedang diputar" berfungsi sebagai tombol jeda/lanjut/ulang. Setelah memilih,
  fokus dikembalikan ke dialog karena baris yang diklik pindah bagian.
- **Previous:** lagu berjalan > 3 detik → diputar ulang dari awal (seek bila bisa di-seek; bila tidak, dimuat ulang dengan URL baru).
  Selain itu → lagu sebelumnya.
- **Next / auto-next:** lagu berikutnya di queue; di lagu terakhir pemutar berhenti di status `ended` (tanpa error, tanpa request baru).
- **Lagu gagal:** pesan + Retry tampil seperti sebelumnya, dan Next, Previous, serta baris queue tetap aktif sehingga pengguna bisa pindah lagu.
  Tidak ada auto-skip otomatis saat gagal (disengaja, agar kegagalan tidak terlewat).

## Koleksi / Library (tahap 8)

Halaman `/library` berisi **Playlist tersimpan** dan **Recently Played**. Semuanya disimpan di `localStorage` perangkat
ini lewat `LibraryProvider` (di dalam `PlaylistProvider` dan `AudioPlayerProvider`); tidak ada state playback baru.

**Kunci penyimpanan** (semua berversi; `musicverse:last-playlist:v1` milik Beranda tidak berubah):

| Kunci | Isi |
| --- | --- |
| `musicverse:library:v1` | `{ version, playlists: SavedPlaylist[] }`, maks. 30 playlist |
| `musicverse:recent:v1` | `{ version, items: RecentPlay[] }`, maks. 20 lagu |
| `musicverse:library-prefs:v1` | `{ version, view: 'grid' \| 'list', sort: 'recent' \| 'name' }` |

- **Kompatibel dengan struktur track.** `SavedPlaylist` = `PlaylistDetail` + `savedAt`, dan lagunya `PlaylistTrack`
  apa adanya (`id, title, artists, album, duration, cover, url`), jadi bisa langsung jadi playlist aktif atau masuk queue.
- **Simpan otomatis.** Playlist yang berhasil dimuat dari API (termasuk Muat ulang) disimpan/diperbarui. Playlist yang hanya
  dipulihkan dari penyimpanan (`fromCache`) tidak disimpan ulang, jadi playlist yang sudah dihapus tidak muncul lagi setelah
  halaman dibuka ulang. Playlist aktif yang belum ada di Koleksi menampilkan tombol **Simpan ke Koleksi**.
- **Buka.** `restorePlaylist` (di `PlaylistContext`) menampilkan salinan tersimpan tanpa memanggil API, lalu pindah ke Beranda.
  Salinan itu bisa lebih lama dari playlist di Spotify (header menyebutnya; tombol **Muat ulang** memperbarui). Membuka playlist
  yang sudah aktif tidak mengubah apa pun. Membuka playlist lain mengikuti aturan lama: playlist diganti → audio berhenti.
- **Hapus** meminta konfirmasi di kartu dan hanya menghapus salinan di Koleksi: playlist aktif dan pemutaran tidak ikut berhenti.
  Tombol X di form impor tetap menghapus playlist aktif, bukan isi Koleksi.
- **Recently Played.** Lagu dicatat saat status benar-benar `playing` (bukan saat tombol ditekan atau URL audio didapat); jeda/lanjut
  tidak mencatat dua kali. Lagu yang sama dipindah ke atas, bukan digandakan. Memutar dari riwayat memakai playlist aktif sebagai queue
  bila lagunya ada di sana; jika tidak, lagu diputar sendirian.
- **`mp3_url` tidak pernah disimpan.** Lagu disalin lewat daftar field `PlaylistTrack` (whitelist) saat menulis dan membaca, dan
  `PlaybackInfo` (tempat `audioUrl` berada) hanya hidup di state pemutar. Setiap pemutaran tetap meminta URL baru ke endpoint play.
- **Validasi saat dibaca.** JSON rusak, versi/struktur salah, ID playlist yang tidak cocok dengan URL-nya, judul/ID/url lagu
  kosong, dan ID lagu ganda dibuang per entri; entri valid tetap tampil dan pengguna diberi tahu bila ada yang dibuang.
- **Kegagalan penyimpanan.** `localStorage` diblokir → Koleksi tetap jalan di memori dan halaman memberi tahu bahwa data hanya
  bertahan selama tab terbuka. Penyimpanan penuh atau Koleksi sudah 30 playlist → playlist baru **tidak** ditampilkan seolah tersimpan
  dan tidak ada playlist lama yang dibuang diam-diam; pengguna diberi alasannya. Setiap perubahan membaca ulang penyimpanan dulu
  dan mengikuti event `storage`, jadi beberapa tab tidak saling menimpa.
- **Batasan yang jujur.** Aplikasi ini bukan PWA dan memutar lagu selalu butuh internet, jadi Koleksi tidak menjanjikan playlist
  bisa dimuat atau diputar tanpa internet. Data juga bisa hilang jika pengguna menghapus data browser (halaman menyebutnya).

## Konvensi UI

Semua nilai visual berasal dari `tailwind.config.js` dan `src/index.css`; hindari nilai hex langsung di komponen.

- **Warna**: `bg`, `card`, `raised` (+ `raised-hover`), `accent`, `danger`, `ink` / `ink-muted` / `ink-faint`. Teks sekunder minimal `ink-faint` (#8a8a8a, ≥4.5:1).
- **Radius**: kontrol `rounded-full`, kartu/banner/panel `rounded-lg`, thumbnail & baris `rounded-md`, bottom sheet `rounded-t-2xl`.
- **Tipografi**: `font-display` untuk judul (h1 `text-3xl sm:text-4xl`, section `text-xl sm:text-2xl`, kartu `text-base`), `font-sans` untuk isi. Hindari `font-bold` pada teks DM Sans (bobot 700 tidak dimuat).
- **Komponen CSS**: `btn-primary`, `btn-secondary`, `btn-danger` (tinggi 44px), `icon-btn` (44×44), `focus-ring` / `focus-ring-light`, `skeleton`.
- **Target sentuh**: minimal 44px di mobile; di desktop kontrol mini player boleh 36–40px.
- **Safe area**: header, BottomNav, MiniPlayer, FullPlayer, QueuePanel, dan `<main>` memakai `env(safe-area-inset-*)`. Tinggi BottomNav (4rem + 1px + inset bawah) dan posisi MiniPlayer harus tetap sinkron.
- **Gerakan**: animasi hanya untuk respons aksi (buka player/antrean, pindah halaman, skeleton). `prefers-reduced-motion` mematikannya secara global.

## Android (Capacitor)

Panduan instalasi, konfigurasi, build, dan uji perangkat: [docs/ANDROID.md](docs/ANDROID.md). Status: disiapkan, belum pernah dibuild.
