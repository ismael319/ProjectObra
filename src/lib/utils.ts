import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

/** Data de hoje no fuso local em formato ISO (YYYY-MM-DD), sem bugs de UTC do toISOString. */
export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Converte data ISO (YYYY-MM-DD) para formato brasileiro (DD/MM/YYYY). Aceita null. */
export function formatBR(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
