import type { QueueAddResult } from '../types/player'

/** Pesan singkat (toast) untuk hasil menambah lagu ke antrean. */
export const QUEUE_RESULT_TEXT: Record<QueueAddResult, string> = {
  started: 'Antrean masih kosong, jadi lagu ini langsung diputar',
  added: 'Ditambahkan ke antrean',
  moved: 'Dipindah ke urutan berikutnya',
  duplicate: 'Lagu ini sudah ada di antrean',
  current: 'Lagu ini sedang diputar',
  blocked: 'Lagu dari playlist tidak bisa dicampur ke antrean yang sedang berjalan',
}
