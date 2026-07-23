import { Cloud, Pause, ShieldAlert, Wrench, Package, FileText, ClipboardList, HelpCircle, type LucideIcon } from 'lucide-react'

export type OccurrenceCategory =
  | 'climatica'
  | 'paralisacao'
  | 'seguranca'
  | 'qualidade'
  | 'suprimentos'
  | 'tecnica'
  | 'administrativa'
  | 'outro'

export type OccurrenceSeverity = 'baixa' | 'media' | 'alta' | 'critica'

export interface OccurrenceCategoryDef {
  value: OccurrenceCategory
  label: string
  icon: LucideIcon
  color: string // hex, usado nos marcadores da Curva S e nos badges
  badgeClass: string
}

export const OCCURRENCE_CATEGORIES: OccurrenceCategoryDef[] = [
  { value: 'climatica', label: 'Climática', icon: Cloud, color: '#0ea5e9', badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  { value: 'paralisacao', label: 'Paralisação', icon: Pause, color: '#d97706', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'seguranca', label: 'Segurança', icon: ShieldAlert, color: '#dc2626', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'qualidade', label: 'Qualidade', icon: Wrench, color: '#7c3aed', badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'suprimentos', label: 'Suprimentos', icon: Package, color: '#ea580c', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'tecnica', label: 'Técnica', icon: FileText, color: '#4f46e5', badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { value: 'administrativa', label: 'Administrativa', icon: ClipboardList, color: '#475569', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { value: 'outro', label: 'Outro', icon: HelpCircle, color: '#6b7280', badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
]

export interface OccurrenceSeverityDef {
  value: OccurrenceSeverity
  label: string
  color: string
  badgeClass: string
}

export const OCCURRENCE_SEVERITIES: OccurrenceSeverityDef[] = [
  { value: 'baixa', label: 'Baixa', color: '#16a34a', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'media', label: 'Média', color: '#d97706', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  { value: 'alta', label: 'Alta', color: '#ea580c', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'critica', label: 'Crítica', color: '#dc2626', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
]

export function getCategoryDef(category: OccurrenceCategory): OccurrenceCategoryDef {
  return OCCURRENCE_CATEGORIES.find((c) => c.value === category) ?? OCCURRENCE_CATEGORIES[OCCURRENCE_CATEGORIES.length - 1]
}

export function getSeverityDef(severity: OccurrenceSeverity): OccurrenceSeverityDef {
  return OCCURRENCE_SEVERITIES.find((s) => s.value === severity) ?? OCCURRENCE_SEVERITIES[0]
}

// Ocorrências "alta" ou "crítica" viram ponto de atenção na Curva S — as demais
// (baixa/média) ficam só no histórico de Ocorrências, pra não poluir o gráfico.
export function isHighImpact(severity: OccurrenceSeverity): boolean {
  return severity === 'alta' || severity === 'critica'
}
