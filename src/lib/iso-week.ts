// Week helpers: semana com dia inicial configurável (padrão sexta, igual ao
// default histórico do módulo de Programação). O dia inicial normalmente vem
// de ParsedProject.weekStartDay, extraído de <WeekStartDay> do XML do MS
// Project ("A semana começa no(a)" em Opções > Cronograma).
// Convenção: 0=domingo..6=sábado, igual Date.getDay().

export function toISODateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Retorna o primeiro dia da semana (weekStartDay) que contém `date`. */
export function startOfWeek(date: Date, weekStartDay = 5): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0=Dom..6=Sab
  const diff = (day - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/** Retorna o último dia da semana (weekStartDay) que contém `date`. */
export function endOfWeek(date: Date, weekStartDay = 5): Date {
  const s = startOfWeek(date, weekStartDay)
  s.setDate(s.getDate() + 6)
  return s
}

/** Calcula ano e número da semana, a partir do dia inicial configurado (weekStartDay). */
export function getISOWeekYearAndNumber(date: Date, weekStartDay = 5): { year: number; week: number } {
  const weekStart = startOfWeek(date, weekStartDay)
  const year = weekStart.getFullYear()

  // Primeiro dia inicial de semana do ano
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay() // 0=Dom..6=Sab
  const daysToFirstWeekStart = (weekStartDay - jan1Day + 7) % 7
  const firstWeekStart = new Date(Date.UTC(year, 0, 1 + daysToFirstWeekStart))

  const diffMs = weekStart.getTime() - firstWeekStart.getTime()
  const week = Math.floor(diffMs / (7 * 86400000)) + 1

  return { year, week }
}

/** Retorna o dia inicial (weekStartDay) da semana (ano, semana). */
export function isoWeekFromParts(year: number, week: number, weekStartDay = 5): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay()
  const daysToFirstWeekStart = (weekStartDay - jan1Day + 7) % 7
  const firstWeekStart = new Date(Date.UTC(year, 0, 1 + daysToFirstWeekStart))

  const result = new Date(firstWeekStart)
  result.setUTCDate(firstWeekStart.getUTCDate() + (week - 1) * 7)
  return new Date(result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate())
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

export const WEEKDAY_LABELS = ['Sex', 'Sáb', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui']
