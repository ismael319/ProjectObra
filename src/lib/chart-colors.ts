// Paletas de cores compartilhadas para gráficos Recharts.
// Evita duplicação em 7+ arquivos de dashboard.

/** Paleta padrão — 8 cores para a maioria dos gráficos (barras, pizza, etc.) */
export const CHART_COLORS = [
  '#2563eb', '#16a34a', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
] as const

/** Paleta estendida — 9 cores (adiciona laranja para RDR dashboard) */
export const CHART_COLORS_EXTENDED = [
  ...CHART_COLORS,
  '#f97316',
] as const

/** Paleta do Gantt — 8 cores com contraste elevado para barras de cronograma */
export const GANTT_COLORS = [
  '#2F6FE4', '#E07B2F', '#2FAE54', '#B23FE0',
  '#E0B23F', '#E03F5F', '#3FE0C0', '#5F3FE0',
] as const
