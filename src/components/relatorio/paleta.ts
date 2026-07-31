// Cores em hex literal (não classes nomeadas do Tailwind, ex.: bg-emerald-100) pros
// cards de relatório visual. O Tailwind v4 resolve a paleta padrão via oklch(), que o
// html2canvas (usado pra gerar o PNG) não sabe interpretar e falha a captura inteira —
// usando hex direto aqui, a exportação funciona independente disso.
export const COR = {
  navy: '#0f1b3d',
  bg: '#f3efe9',
  white: '#ffffff',
  emerald100: '#d1fae5',
  emerald300: '#6ee7b7',
  emerald600: '#059669',
  emerald700: '#047857',
  red100: '#fee2e2',
  red600: '#dc2626',
  red700: '#b91c1c',
  amber100: '#fef3c7',
  amber300: '#fcd34d',
  amber600: '#d97706',
  rose300: '#fda4af',
  gray100: '#f3f4f6',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray800: '#1f2937',
  gray900: '#111827',
  indigo500: '#6366f1',
} as const
