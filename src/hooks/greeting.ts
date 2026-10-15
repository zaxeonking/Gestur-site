import { useEffect, useState } from 'react'

/** Sapaan berdasarkan jam lokal perangkat. */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours()
  if (hour < 4) return 'Selamat malam'
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

/** Sapaan yang ikut berganti jika halaman dibiarkan terbuka melewati pergantian waktu. */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState(() => getGreeting())

  useEffect(() => {
    const id = setInterval(() => setGreeting(getGreeting()), 60_000)
    return () => clearInterval(id)
  }, [])

  return greeting
}
