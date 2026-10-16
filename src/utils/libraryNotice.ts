import type { LibraryNotice } from '../context/LibraryContext'
import { MAX_SAVED_PLAYLISTS } from './libraryStorage'

/** Pesan kegagalan menyimpan/menghapus Koleksi (dipakai halaman Koleksi dan tampilan playlist). */
export function noticeMessage({ reason, action, title }: LibraryNotice): string {
  if (action === 'remove') {
    return reason === 'quota'
      ? `“${title}” belum bisa dihapus dari Koleksi karena penyimpanan browser bermasalah. Coba lagi.`
      : `“${title}” belum terhapus dari Koleksi karena browser tidak mengizinkan penyimpanan lokal.`
  }
  switch (reason) {
    case 'quota':
      return `“${title}” tidak masuk ke Koleksi karena penyimpanan browser penuh. Hapus playlist lain, lalu simpan lagi.`
    case 'limit':
      return `Koleksi sudah berisi ${MAX_SAVED_PLAYLISTS} item, jadi “${title}” belum disimpan. Hapus salah satu untuk menyimpannya.`
    case 'single':
      return `“${title}” adalah lagu satuan, jadi tidak bisa disimpan ke Koleksi. Simpan lewat “Simpan ke playlist saya”.`
    case 'invalid':
      return `“${title}” tidak bisa disimpan karena datanya tidak valid.`
    case 'unavailable':
      return `“${title}” tidak disimpan karena browser tidak mengizinkan penyimpanan lokal.`
  }
}
