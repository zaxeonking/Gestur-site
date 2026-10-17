/**
 * Menelan satu `click` berikutnya di seluruh halaman (fase capture), maksimal `ms` milidetik.
 *
 * Dipakai setelah gestur pointer yang mengubah/memindahkan elemen di bawah jari (gelembung
 * membesar jadi kartu, kartu mengecil jadi gelembung, dsb.). Browser tetap mengirim `click`
 * susulan setelah jari diangkat, dan karena elemen aslinya sudah berganti, klik itu jatuh ke
 * elemen di belakangnya (mis. baris lagu) dan memutar lagu yang salah.
 */
export function swallowNextClick(ms = 350): void {
  let timer = 0
  const cleanup = () => {
    window.removeEventListener('click', handler, true)
    window.clearTimeout(timer)
  }
  function handler(event: Event) {
    event.stopPropagation()
    event.preventDefault()
    cleanup()
  }
  window.addEventListener('click', handler, true)
  timer = window.setTimeout(cleanup, ms)
}
