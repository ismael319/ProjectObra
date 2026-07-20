// Funções de operações CRUD para Programação Semanal.
// Adaptado do Weekly Craft Pro para usar Supabase client diretamente.

import { supabase } from './supabase'
import type { ActivityLike, ActivityStatus } from './adherence'
import { isoWeekFromParts, addDays, toISODateStr } from './iso-week'

interface WeekRow {
  id: string
  iso_year: number
  iso_week: number
  start_date: string
  end_date: string
  status: 'rascunho' | 'consolidado'
  consolidated_at: string | null
  created_at: string
}

interface ActivityRow {
  id: string
  week_id: string
  task_uid: string | null
  name: string
  company: string | null
  discipline: string | null
  area: string | null
  stage: string | null
  foreman: string | null
  planned_date: string
  planned_pct: number
  status: ActivityStatus
  is_extra: boolean
  observation: string | null
  actual_productivity: string | null
  created_at: string
  updated_at: string
}

interface WeekData {
  week: WeekRow
  activities: ActivityLike[]
  partialWeight: number
}

// Garante que a semana existe (Sex→Qui), criando ou corrigindo se necessário
async function ensureWeek(isoYear: number, isoWeek: number): Promise<WeekRow> {
  const friday = isoWeekFromParts(isoYear, isoWeek)
  const thursday = addDays(friday, 6)
  const startDate = toISODateStr(friday)
  const endDate = toISODateStr(thursday)

  const { data: existing } = await supabase
    .from('weeks')
    .select('*')
    .eq('iso_year', isoYear)
    .eq('iso_week', isoWeek)
    .maybeSingle()

  if (existing) {
    // Semanas criadas antes da convenção Sex→Qui podem ter start_date/end_date
    // desalinhados (ex: Seg→Dom) — corrige na leitura para manter os cards do
    // dia consistentes com o cronograma.
    if (existing.start_date !== startDate || existing.end_date !== endDate) {
      const { data, error } = await supabase
        .from('weeks')
        .update({ start_date: startDate, end_date: endDate })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (!error && data) return data as WeekRow
      // Sem permissão para corrigir no banco (ex: papel "campo", restrito pelo RLS)
      // — usa as datas certas só nesta sessão; um usuário com permissão fixa depois.
      return { ...existing, start_date: startDate, end_date: endDate } as WeekRow
    }
    return existing as WeekRow
  }

  const { data, error } = await supabase
    .from('weeks')
    .insert({
      iso_year: isoYear,
      iso_week: isoWeek,
      start_date: startDate,
      end_date: endDate,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as WeekRow
}

// Buscar semana + atividades
export async function getWeek(isoYear: number, isoWeek: number): Promise<WeekData> {
  const week = await ensureWeek(isoYear, isoWeek)

  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('week_id', week.id)
    .order('planned_date', { ascending: true })

  if (error) throw new Error(error.message)

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'partial_weight')
    .maybeSingle()

  const partialWeight = setting && typeof setting.value === 'number' ? setting.value : 0.5

  const mappedActivities: ActivityLike[] = (activities ?? []).map((a: ActivityRow) => ({
    id: a.id,
    name: a.name,
    company: a.company,
    discipline: a.discipline,
    area: a.area,
    stage: a.stage,
    foreman: a.foreman,
    planned_date: a.planned_date,
    planned_pct: a.planned_pct,
    status: a.status,
    is_extra: a.is_extra,
    observation: a.observation,
  }))

  return { week, activities: mappedActivities, partialWeight }
}

// Consolidar semana
export async function consolidateWeek(weekId: string): Promise<void> {
  const { error } = await supabase
    .from('weeks')
    .update({ status: 'consolidado', consolidated_at: new Date().toISOString() })
    .eq('id', weekId)

  if (error) throw new Error(error.message)
}

// Atualizar status de atividade
export async function setActivityStatus(
  activityId: string,
  status: ActivityStatus,
  observation?: string | null,
): Promise<void> {
  const patch: { status: ActivityStatus; observation?: string | null } = { status }
  if (observation !== undefined) patch.observation = observation

  const { error } = await supabase.from('activities').update(patch).eq('id', activityId)
  if (error) throw new Error(error.message)
}

// Deletar atividade
export async function deleteActivity(activityId: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  if (error) throw new Error(error.message)
}

// Adicionar atividade extra
export async function addExtraActivity(payload: {
  weekId: string
  planned_date: string
  name: string
  company?: string | null
  discipline?: string | null
  area?: string | null
  stage?: string | null
  foreman?: string | null
}): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    week_id: payload.weekId,
    name: payload.name,
    planned_date: payload.planned_date,
    is_extra: true,
    company: payload.company ?? null,
    discipline: payload.discipline ?? null,
    area: payload.area ?? null,
    stage: payload.stage ?? null,
    foreman: payload.foreman ?? null,
    planned_pct: 100,
  })

  if (error) throw new Error(error.message)
}

// Merge Excel: atualizar status via planilha
export async function mergeExcel(
  weekId: string,
  rows: Array<Record<string, string | number | null>>,
): Promise<{ updated: number }> {
  const { data: existing } = await supabase.from('activities').select('*').eq('week_id', weekId)

  const byUid = new Map(
    (existing ?? []).filter((a: ActivityRow) => a.task_uid).map((a: ActivityRow) => [a.task_uid!, a]),
  )

  let updated = 0

  const STATUS_MAP: Record<string, ActivityStatus> = {
    concluida: 'concluida',
    'concluída': 'concluida',
    parcial: 'parcial',
    nao_concluida: 'nao_concluida',
    'não concluída': 'nao_concluida',
    'nao concluida': 'nao_concluida',
    pendente: 'pendente',
  }

  for (const raw of rows) {
    const uid = String(raw.UID ?? raw.uid ?? '').trim()
    if (!uid) continue

    const target = byUid.get(uid)
    if (!target) continue

    const rawStatus = String(raw.Status ?? raw.status ?? '').trim().toLowerCase()
    const st = STATUS_MAP[rawStatus] ?? (target as ActivityRow).status

    const patch = {
      status: st,
      observation:
        raw['Observações'] != null
          ? String(raw['Observações'])
          : raw.observacoes != null
            ? String(raw.observacoes)
            : (target as ActivityRow).observation,
      actual_productivity:
        raw['Produtividade Real'] != null
          ? String(raw['Produtividade Real'])
          : (target as ActivityRow).actual_productivity,
    }

    const { error } = await supabase.from('activities').update(patch).eq('id', target.id)
    if (!error) updated += 1
  }

  return { updated }
}
