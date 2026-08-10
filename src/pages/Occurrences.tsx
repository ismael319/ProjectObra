import { useMemo, useState } from 'react'
import { useProject } from '@/lib/project-context'
import { useMediaQuery } from '@/lib/use-media-query'
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EffortKpiCard } from '@/pages/apontamento/components/EffortKpiCard'
import {
  OCCURRENCE_CATEGORIES,
  OCCURRENCE_SEVERITIES,
  getCategoryDef,
  getSeverityDef,
  getStatusDef,
  isHighImpact,
  type OccurrenceCategory,
  type OccurrenceSeverity,
} from '@/lib/occurrence-types'

const CONTROL_CLASS = 'min-h-11 sm:min-h-9'

function hojeLocalISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

export default function Occurrences() {
  const { project, activities, occurrences, addOccurrence, removeOccurrence, resolveOccurrence, reopenOccurrence } = useProject()
  const isMobile = useMediaQuery('(max-width: 639px)')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    date: hojeLocalISO(),
    type: 'outro' as OccurrenceCategory,
    severity: 'media' as OccurrenceSeverity,
    description: '',
    impactDays: 0,
    activityUid: undefined as number | undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addOccurrence({
      date: new Date(formData.date),
      type: formData.type,
      severity: formData.severity,
      description: formData.description,
      impactDays: formData.impactDays,
      activityUid: formData.activityUid,
    })
    setFormData({
      date: hojeLocalISO(),
      type: 'outro',
      severity: 'media',
      description: '',
      impactDays: 0,
      activityUid: undefined,
    })
    setShowForm(false)
  }

  const totalImpactDays = occurrences.reduce((sum, o) => sum + o.impactDays, 0)
  const highImpactCount = occurrences.filter((o) => isHighImpact(o.severity)).length
  const openCount = occurrences.filter((o) => o.status === 'aberta').length
  const safetyCount = occurrences.filter((o) => o.type === 'seguranca').length

  const sortedOccurrences = useMemo(
    () => [...occurrences].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [occurrences],
  )
  const activityOptions = useMemo(() => {
    const seen = new Set<number>()
    return activities.filter((a) => {
      if (a.isSummary) return false
      if (seen.has(a.uid)) return false
      seen.add(a.uid)
      return true
    })
  }, [activities])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ocorrências</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{project?.name || 'Nenhum projeto carregado'}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="min-h-11 w-full sm:w-auto">
          <Plus className="size-4" />
          Nova Ocorrência
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <EffortKpiCard title="Total de Ocorrências" value={occurrences.length} icon={ClipboardList} accent="#2563eb" iconBackgroundClassName="bg-blue-50 dark:bg-blue-500/10" iconClassName="text-blue-600 dark:text-blue-400" />
        <EffortKpiCard title="Abertas" value={openCount} icon={Clock} accent="#d97706" iconBackgroundClassName="bg-amber-50 dark:bg-amber-500/10" iconClassName="text-amber-600 dark:text-amber-400" />
        <EffortKpiCard title="Dias de Impacto" value={totalImpactDays} icon={CalendarX} accent="#dc2626" iconBackgroundClassName="bg-red-50 dark:bg-red-500/10" iconClassName="text-red-600 dark:text-red-400" />
        <EffortKpiCard title="Alto Impacto (Curva S)" value={highImpactCount} icon={TrendingUp} accent="#ea580c" iconBackgroundClassName="bg-orange-50 dark:bg-orange-500/10" iconClassName="text-orange-600 dark:text-orange-400" />
        <div className="col-span-2 lg:col-span-1">
          <EffortKpiCard title="Segurança" value={safetyCount} icon={ShieldAlert} accent="#dc2626" iconBackgroundClassName="bg-red-50 dark:bg-red-500/10" iconClassName="text-red-600 dark:text-red-400" />
        </div>
      </div>

      {/* New Occurrence Form */}
      {showForm && (
        <div className="rounded-2xl border bg-card p-4 shadow-card sm:rounded-xl sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Registrar Ocorrência</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-400 sm:h-8 sm:w-8"
              aria-label="Fechar formulário"
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="occ-data">Data</Label>
                <Input
                  id="occ-data"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className={CONTROL_CLASS}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occ-categoria">Categoria</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as OccurrenceCategory })}>
                  <SelectTrigger id="occ-categoria" className={CONTROL_CLASS}>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCURRENCE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occ-gravidade">
                  Gravidade
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(alta/crítica vira ponto de atenção na Curva S)</span>
                </Label>
                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v as OccurrenceSeverity })}>
                  <SelectTrigger id="occ-gravidade" className={CONTROL_CLASS}>
                    <SelectValue placeholder="Selecione a gravidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCURRENCE_SEVERITIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occ-descricao">Descrição</Label>
              <Textarea
                id="occ-descricao"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Descreva a ocorrência..."
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="occ-impacto">Dias de Impacto</Label>
                <Input
                  id="occ-impacto"
                  type="number"
                  value={formData.impactDays}
                  onChange={(e) => setFormData({ ...formData, impactDays: parseInt(e.target.value) || 0 })}
                  className={CONTROL_CLASS}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="occ-atividade">Atividade Afetada (opcional)</Label>
                <Select
                  value={String(formData.activityUid ?? '')}
                  onValueChange={(v) => setFormData({ ...formData, activityUid: v ? parseInt(v) : undefined })}
                >
                  <SelectTrigger id="occ-atividade" className={CONTROL_CLASS}>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma</SelectItem>
                    {activityOptions.map((a) => (
                      <SelectItem key={a.uid} value={String(a.uid)}>
                        <span className="truncate">{a.wbs} - {a.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="min-h-11 flex-1 sm:flex-none">
                Cancelar
              </Button>
              <Button type="submit" className="min-h-11 flex-1 sm:flex-none">
                Registrar
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Occurrences List */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card sm:rounded-xl">
        {occurrences.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} aria-hidden="true" />
            <p className="text-gray-500 dark:text-gray-400">Nenhuma ocorrência registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {sortedOccurrences
              .map((occ) => {
                const categoryDef = getCategoryDef(occ.type)
                const severityDef = getSeverityDef(occ.severity)
                const statusDef = getStatusDef(occ.status)
                const CategoryIcon = categoryDef.icon
                const activity = occ.activityUid != null ? activities.find((a) => a.uid === occ.activityUid) : null
                const isOpen = occ.status === 'aberta'

                return (
                  <div key={occ.id} className={`p-4 transition hover:bg-gray-50 dark:hover:bg-gray-700/50 ${!isOpen ? 'opacity-60' : ''}`}>
                    {isMobile ? (
                      <>
                        <div className="flex items-start gap-3">
                          <div
                            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: categoryDef.color + '1a', color: categoryDef.color }}
                          >
                            <CategoryIcon size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{categoryDef.label}</span>
                              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                {new Date(occ.date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusDef.badgeClass}`}>
                                {statusDef.label}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityDef.badgeClass}`}>
                                {severityDef.label}
                              </span>
                              {isHighImpact(occ.severity) && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium" title="Aparece como ponto de atenção na Curva S">
                                  ⚠ Curva S
                                </span>
                              )}
                              {occ.impactDays > 0 && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                  +{occ.impactDays} dias
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="mt-2.5 break-words text-sm text-gray-600 dark:text-gray-300">{occ.description}</p>
                        {activity && (
                          <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                            Atividade: {activity.wbs} - {activity.name}
                          </p>
                        )}
                        <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-700">
                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => resolveOccurrence(occ.id)}
                              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-500/10"
                              title="Marcar como resolvida"
                              aria-label={`Marcar ${categoryDef.label} como resolvida`}
                            >
                              <CheckCircle2 size={20} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => reopenOccurrence(occ.id)}
                              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10"
                              title="Reabrir"
                              aria-label={`Reabrir ${categoryDef.label}`}
                            >
                              <RotateCcw size={20} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeOccurrence(occ.id)}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                            title="Excluir"
                            aria-label={`Excluir ${categoryDef.label}`}
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-4">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: categoryDef.color + '1a', color: categoryDef.color }}
                        >
                          <CategoryIcon size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{categoryDef.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusDef.badgeClass}`}>
                              {statusDef.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityDef.badgeClass}`}>
                              {severityDef.label}
                            </span>
                            {isHighImpact(occ.severity) && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium" title="Aparece como ponto de atenção na Curva S">
                                ⚠ Curva S
                              </span>
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(occ.date).toLocaleDateString('pt-BR')}
                            </span>
                            {occ.impactDays > 0 && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                +{occ.impactDays} dias
                              </span>
                            )}
                          </div>
                          <p className="break-words text-sm text-gray-600 dark:text-gray-300">{occ.description}</p>
                          {activity && (
                            <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                              Atividade: {activity.wbs} - {activity.name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => resolveOccurrence(occ.id)}
                              className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition hover:text-green-600"
                              title="Marcar como resolvida"
                              aria-label={`Marcar ${categoryDef.label} como resolvida`}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => reopenOccurrence(occ.id)}
                              className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition hover:text-amber-600"
                              title="Reabrir"
                              aria-label={`Reabrir ${categoryDef.label}`}
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeOccurrence(occ.id)}
                            className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition hover:text-red-500"
                            title="Excluir"
                            aria-label={`Excluir ${categoryDef.label}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
