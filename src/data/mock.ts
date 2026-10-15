import type { Artist, Genre, Playlist, Track } from '../types'

// Data sementara untuk tahap layout. Akan diganti integrasi API di tahap berikutnya.

export const playlists: Playlist[] = [
  {
    id: 'pl-1',
    title: 'Fokus Senja',
    description: 'Instrumental hangat untuk menutup hari kerja.',
    trackCount: 42,
    cover: { from: '#1DB954', to: '#0b3d20', shape: 'rings' },
  },
  {
    id: 'pl-2',
    title: 'Jalan Pagi',
    description: 'Tempo ringan, langkah ikut semangat.',
    trackCount: 30,
    cover: { from: '#ff9a3c', to: '#8a2f12', shape: 'sun' },
  },
  {
    id: 'pl-3',
    title: 'Hujan di Jendela',
    description: 'Lagu pelan untuk sore yang basah.',
    trackCount: 55,
    cover: { from: '#4f7cff', to: '#10204f', shape: 'dots' },
  },
  {
    id: 'pl-4',
    title: 'Gas Pol',
    description: 'Beat kencang untuk olahraga.',
    trackCount: 38,
    cover: { from: '#ff4d6d', to: '#4a0f22', shape: 'bars' },
  },
  {
    id: 'pl-5',
    title: 'Akustik Santai',
    description: 'Gitar dan suara, tanpa banyak hiasan.',
    trackCount: 27,
    cover: { from: '#e8c547', to: '#5c4a08', shape: 'rings' },
  },
  {
    id: 'pl-6',
    title: 'Malam Panjang',
    description: 'Teman begadang dengan vokal lembut.',
    trackCount: 61,
    cover: { from: '#9b5de5', to: '#2a0f4f', shape: 'dots' },
  },
  {
    id: 'pl-7',
    title: 'Pesta Kecil',
    description: 'Lagu singalong untuk kumpul bareng teman.',
    trackCount: 48,
    cover: { from: '#00c2b8', to: '#063f3c', shape: 'bars' },
  },
  {
    id: 'pl-8',
    title: 'Kenangan 2000-an',
    description: 'Dari radio ke earphone, dengarkan lagi.',
    trackCount: 70,
    cover: { from: '#f15bb5', to: '#4f0c37', shape: 'sun' },
  },
]

export const artists: Artist[] = [
  { id: 'ar-1', name: 'Laras Mentari', cover: { from: '#ff9a3c', to: '#5a1d0a', shape: 'sun' } },
  { id: 'ar-2', name: 'Biru Langit', cover: { from: '#4f7cff', to: '#0c1a46', shape: 'rings' } },
  { id: 'ar-3', name: 'Dua Satu', cover: { from: '#1DB954', to: '#07301a', shape: 'bars' } },
  { id: 'ar-4', name: 'Nara & Kawan', cover: { from: '#f15bb5', to: '#3d0a2b', shape: 'dots' } },
  { id: 'ar-5', name: 'Kopi Hitam', cover: { from: '#c9a27a', to: '#3a2514', shape: 'rings' } },
  { id: 'ar-6', name: 'Sunyi Kota', cover: { from: '#9b5de5', to: '#1f0b3d', shape: 'sun' } },
  { id: 'ar-7', name: 'Rimba Raya', cover: { from: '#00c2b8', to: '#05302d', shape: 'dots' } },
  { id: 'ar-8', name: 'Api Unggun', cover: { from: '#ff4d6d', to: '#3d0b19', shape: 'bars' } },
]

export const tracks: Track[] = [
  { id: 'tr-1', title: 'Lampu Kota', artist: 'Laras Mentari', album: 'Jalan Pulang', duration: '3:42', cover: playlists[0].cover },
  { id: 'tr-2', title: 'Pagi yang Pelan', artist: 'Biru Langit', album: 'Embun', duration: '4:05', cover: playlists[1].cover },
  { id: 'tr-3', title: 'Di Balik Hujan', artist: 'Nara & Kawan', album: 'Sore Basah', duration: '3:18', cover: playlists[2].cover },
  { id: 'tr-4', title: 'Lari Sampai Pagi', artist: 'Dua Satu', album: 'Detak', duration: '2:56', cover: playlists[3].cover },
  { id: 'tr-5', title: 'Secangkir Cerita', artist: 'Kopi Hitam', album: 'Meja Pojok', duration: '3:31', cover: playlists[4].cover },
  { id: 'tr-6', title: 'Tengah Malam', artist: 'Sunyi Kota', album: 'Tanpa Suara', duration: '4:27', cover: playlists[5].cover },
  { id: 'tr-7', title: 'Nyanyi Bareng', artist: 'Rimba Raya', album: 'Lingkaran', duration: '3:09', cover: playlists[6].cover },
  { id: 'tr-8', title: 'Radio Tua', artist: 'Api Unggun', album: 'Gelombang', duration: '3:50', cover: playlists[7].cover },
]

export const genres: Genre[] = [
  { id: 'g-1', name: 'Pop', cover: { from: '#f15bb5', to: '#7a1d5a', shape: 'sun' } },
  { id: 'g-2', name: 'Indie', cover: { from: '#4f7cff', to: '#1b2f80', shape: 'rings' } },
  { id: 'g-3', name: 'Hip-Hop', cover: { from: '#ff9a3c', to: '#8a4210', shape: 'bars' } },
  { id: 'g-4', name: 'Rock', cover: { from: '#ff4d6d', to: '#7a1530', shape: 'bars' } },
  { id: 'g-5', name: 'Akustik', cover: { from: '#e8c547', to: '#7a6410', shape: 'rings' } },
  { id: 'g-6', name: 'Elektronik', cover: { from: '#00c2b8', to: '#0a5c57', shape: 'dots' } },
  { id: 'g-7', name: 'Jazz', cover: { from: '#9b5de5', to: '#45228a', shape: 'sun' } },
  { id: 'g-8', name: 'Santai', cover: { from: '#1DB954', to: '#0e5a2a', shape: 'dots' } },
]
