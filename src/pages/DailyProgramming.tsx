import { useMemo, useState, useEffect, useCallback } from 'react'
import { Calendar, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'

import { getISOWeekYearAndNumber, isoWeekFromParts, addDays, toISODateStr, parseISODateStr } from '@/lib/iso-week'
import { computeIndicators, computeSegment, type ActivityLike, type ActivityStatus } from '@/lib/adherence'
import {
  getWeek,
  lockWeek,
  unlockWeek,
  setActivityStatus,
  deleteActivity,
  addExtraActivity,
  mergeExcel,
  clearWeekActivities,
  clearDayActivities,
} from '@/lib/programacao-db'
import { useProjects } from '@/lib/project-store'
import { findActivitiesWithWorkInWeek, type WeekActivity } from '@/lib/week-activities'

import WeekBar from '@/components/programacao/WeekBar'
import CardDia from '@/components/programacao/CardDia'
import ModalDetalheDia from '@/components/programacao/ModalDetalheDia'
import ModalImportarAtividades from '@/components/programacao/ModalImportarAtividades'
import IndicadoresSemana from '@/components/programacao/IndicadoresSemana'
import PainelAderencia from '@/components/programacao/PainelAderencia'

export default function DailyProgramming() {
  const { currentProject } = useProjects()
  const now = new Date()
  const cur = getISOWeekYearAndNumber(now)
  const [isoYear, setIsoYear] = useState(cur.year)
  const [isoWeek, setIsoWeek] = useState(cur.week)
  const [loading, setLoading] = useState(true)
  const [weekData, setWeekData] = useState<{
    week: { id: string; iso_year: number; iso_week: number; start_date: string; end_date: string; status: 'rascunho' | 'consolidado' }
    activities: ActivityLike[]
    partialWeight: number
  } | null>(null)
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [showWeekActivities, setShowWeekActivities] = useState(false)
  const [weekActivities, setWeekActivities] = useState<WeekActivity[]>([])
  const [loadingWeekActivities, setLoadingWeekActivities] = useState(false)
  const [showDayImport, setShowDayImport] = useState(false)
  const [dayImportDate, setDayImportDate] = useState<string | null>(null)
  const [dayImportActivities, setDayImportActivities] = useState<WeekActivity[]>([])
  const [loadingDayImport, setLoadingDayImport] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWeek(isoYear, isoWeek)
      setWeekData(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar semana'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [isoYear, isoWeek])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const activities = weekData?.activities ?? []
  const partialWeight = weekData?.partialWeight ?? 0.5

  const indicators = useMemo(() => computeIndicators(activities, partialWeight), [activities, partialWeight])

  const segEmpresa = useMemo(() => computeSegment(activities, 'company', partialWeight), [activities, partialWeight])
  const segDisc = useMemo(() => computeSegment(activities, 'discipline', partialWeight), [activities, partialWeight])
  const segArea = useMemo(() => computeSegment(activities, 'area', partialWeight), [activities, partialWeight])
  const segEtapa = useMemo(() => computeSegment(activities, 'stage', partialWeight), [activities, partialWeight])
  const segEnc = useMemo(() => computeSegment(activities, 'foreman', partialWeight), [activities, partialWeight])

  const days = useMemo(() => {
    if (!weekData?.week) return []
    const start = parseISODateStr(weekData.week.start_date)
    return Array.from({ length: 7 }, (_, i) => toISODateStr(addDays(start, i)))
  }, [weekData?.week])

  const activitiesByDate = useMemo(() => {
    const m = new Map<string, ActivityLike[]>()
    for (const d of days) m.set(d, [])
    for (const a of activities) {
      const arr = m.get(a.planned_date)
      if (arr) arr.push(a)
      else m.set(a.planned_date, [a])
    }
    return m
  }, [days, activities])

  // Cronogramas ativos no formato que o ColumnValueFilter (mesmo componente da Curva
  // S) e o cálculo de exclusão por coluna esperam — inclui também os índices de LB
  // (0-10) disponíveis EM CADA cronograma, já que cada um pode ter baselines
  // diferentes e a seleção de LB na janela de importação é por cronograma.
  const importSources = useMemo(() => {
    return (currentProject?.cronogramas || [])
      .filter((c) => c.ativo && c.dados)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        activities: c.dados!.activities,
        customFieldDefs: c.dados!.customFieldDefs || [],
        availableBLIndices: c.dados!.baselines.filter((bl) => bl.available).map((bl) => bl.index).sort((a, b) => a - b),
      }))
  }, [currentProject])

  const handleSearchWeekActivities = () => {
    if (!currentProject?.cronogramas?.length) {
      toast.warning('Nenhum cronograma carregado no projeto')
      return
    }

    setLoadingWeekActivities(true)
    setShowWeekActivities(true)

    try {
      const friday = isoWeekFromParts(isoYear, isoWeek)
      const thursday = addDays(friday, 6)
      const results = findActivitiesWithWorkInWeek(
        currentProject.cronogramas,
        friday,
        thursday,
      )
      setWeekActivities(results)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao buscar atividades'
      toast.error(msg)
    } finally {
      setLoadingWeekActivities(false)
    }
  }

  // Mesma busca de "Importar atividades", mas escopada a um único dia — pro caso de
  // precisar adicionar uma tarefa do cronograma num dia que normalmente não teria
  // (ex.: domingo). O intervalo vai até o INÍCIO do dia seguinte (não até a
  // meia-noite do próprio dia), senão atividades que começam depois de 00h no dia
  // escolhido ficariam de fora da sobreposição.
  const handleSearchDayActivities = (date: string) => {
    if (!currentProject?.cronogramas?.length) {
      toast.warning('Nenhum cronograma carregado no projeto')
      return
    }

    setDayImportDate(date)
    setLoadingDayImport(true)
    setShowDayImport(true)

    try {
      const dayStart = parseISODateStr(date)
      const dayEnd = addDays(dayStart, 1)
      const results = findActivitiesWithWorkInWeek(currentProject.cronogramas, dayStart, dayEnd)
      setDayImportActivities(results)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao buscar atividades'
      toast.error(msg)
    } finally {
      setLoadingDayImport(false)
    }
  }

  const goto = (y: number, w: number) => {
    setIsoYear(y)
    setIsoWeek(w)
  }

  const shift = (delta: number) => {
    const friday = isoWeekFromParts(isoYear, isoWeek)
    const next = addDays(friday, delta * 7)
    const p = getISOWeekYearAndNumber(next)
    goto(p.year, p.week)
  }

  const handleExportExcel = () => {
    if (!weekData) return
    const statusLabel: Record<string, string> = {
      pendente: 'Pendente',
      concluida: 'Concluída',
      parcial: 'Parcial',
      nao_concluida: 'Não concluída',
    }
    const rows = activities.map((a) => ({
      UID: a.id,
      Nome: a.name,
      Empresa: a.company ?? '',
      Disciplina: a.discipline ?? '',
      Área: a.area ?? '',
      Etapa: a.stage ?? '',
      Encarregado: a.foreman ?? '',
      Data: a.planned_date,
      '% Previsto': a.planned_pct,
      Status: statusLabel[a.status] ?? a.status,
      Observações: a.observation ?? '',
      'Produtividade Real': '',
      Extra: a.is_extra ? 'Sim' : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Programação')
    XLSX.writeFile(wb, `programacao-${isoYear}-S${String(isoWeek).padStart(2, '0')}.xlsx`)
    toast.success('Excel exportado com sucesso')
  }

  const handleImportExcel = async (file: File) => {
    if (!weekData?.week) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(ws, { defval: null })
      const result = await mergeExcel(weekData.week.id, rows)
      toast.success(`Excel importado: ${result.updated} atividade(s) atualizada(s)`)
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao importar Excel'
      toast.error(msg)
    }
  }

  const handleLock = async () => {
    if (!weekData?.week) return
    try {
      await lockWeek(weekData.week.id)
      toast.success('Semana bloqueada')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao bloquear semana'
      toast.error(msg)
    }
  }

  const handleUnlock = async () => {
    if (!weekData?.week) return
    try {
      await unlockWeek(weekData.week.id)
      toast.success('Semana desbloqueada')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao desbloquear semana'
      toast.error(msg)
    }
  }

  const handleClearWeek = async () => {
    if (!weekData?.week) return
    if (!confirm('Remover todas as atividades desta semana (inclusive as extras)? Esta ação não pode ser desfeita.')) return
    try {
      await clearWeekActivities(weekData.week.id)
      toast.success('Semana limpa')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao limpar semana'
      toast.error(msg)
    }
  }

  const handleClearDay = async (date: string) => {
    if (!weekData?.week) return
    if (!confirm(`Remover todas as atividades de ${date} (inclusive as extras)? Esta ação não pode ser desfeita.`)) return
    try {
      await clearDayActivities(weekData.week.id, date)
      toast.success('Dia limpo')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao limpar o dia'
      toast.error(msg)
    }
  }

  const handleSetStatus = async (id: string, status: ActivityStatus, observation: string | null) => {
    try {
      await setActivityStatus(id, status, observation)
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao atualizar status'
      toast.error(msg)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteActivity(id)
      toast.success('Atividade removida')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao remover'
      toast.error(msg)
    }
  }

  const handleAddExtra = async (payload: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => {
    if (!weekData?.week) return
    try {
      await addExtraActivity({ weekId: weekData.week.id, ...payload })
      toast.success('Atividade extra adicionada')
      fetchData()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao adicionar'
      toast.error(msg)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    )
  }

  if (!weekData) {
    return (
      <div className="text-center py-16">
        <Calendar className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Erro ao carregar dados</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Verifique a conexão com o banco de dados</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WeekBar
        isoYear={weekData.week.iso_year}
        isoWeek={weekData.week.iso_week}
        startDate={weekData.week.start_date}
        endDate={weekData.week.end_date}
        status={weekData.week.status}
        ppc={indicators.ppc}
        aderencia={indicators.aderencia}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={() => goto(cur.year, cur.week)}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        onLock={handleLock}
        onUnlock={handleUnlock}
        onImportActivities={handleSearchWeekActivities}
        onClearWeek={handleClearWeek}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => (
          <CardDia key={d} date={d} activities={activitiesByDate.get(d) ?? []} onOpen={setOpenDate} />
        ))}
      </div>

      <IndicadoresSemana ind={indicators} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <PainelAderencia title="Aderência por Empresa" rows={segEmpresa} />
        <PainelAderencia title="Aderência por Disciplina" rows={segDisc} />
        <PainelAderencia title="Aderência por Área" rows={segArea} />
        <PainelAderencia title="Aderência por Etapa" rows={segEtapa} />
        <PainelAderencia title="Aderência por Encarregado" rows={segEnc} />
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Indicadores calculados a partir do status registrado — PPC ponderado Credit activities with partial progress.
      </p>

      <ModalDetalheDia
        open={!!openDate}
        onOpenChange={(v) => !v && setOpenDate(null)}
        date={openDate}
        activities={openDate ? (activitiesByDate.get(openDate) ?? []) : []}
        weekConsolidated={weekData.week.status === 'consolidado'}
        onSetStatus={handleSetStatus}
        onDelete={handleDelete}
        onAddExtra={handleAddExtra}
        onClearDay={() => openDate && handleClearDay(openDate)}
        onAddFromCronograma={() => openDate && handleSearchDayActivities(openDate)}
      />

      <ModalImportarAtividades
        open={showWeekActivities}
        onOpenChange={setShowWeekActivities}
        activities={weekActivities}
        loading={loadingWeekActivities}
        sources={importSources}
        weekId={weekData.week.id}
        weekDays={days}
        onImported={fetchData}
      />

      <ModalImportarAtividades
        open={showDayImport}
        onOpenChange={setShowDayImport}
        activities={dayImportActivities}
        loading={loadingDayImport}
        sources={importSources}
        weekId={weekData.week.id}
        weekDays={dayImportDate ? [dayImportDate] : []}
        onImported={fetchData}
      />
    </div>
  )
}
