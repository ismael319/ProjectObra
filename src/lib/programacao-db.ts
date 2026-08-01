// Funções de operações CRUD para Programação Semanal.
// Adaptado do Weekly Craft Pro para usar Supabase client diretamente.

import { supabase } from './supabase'
import type { ActivityLike, ActivityStatus, SubEtapa } from './adherence'
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
  source_cronograma: string | null
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
  inativa: boolean
  motivo_inativacao: string | null
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

// Busca as sub-etapas de um conjunto de atividades numa única query (evita N+1 —
// getWeek/getActivitiesInDateRange já trazem várias dezenas de atividades de uma vez)
// e devolve um Map pronto pra anexar em cada ActivityLike.
async function fetchSubetapasByActivity(activityIds: string[]): Promise<Map<string, SubEtapa[]>> {
  const map = new Map<string, SubEtapa[]>()
  if (activityIds.length === 0) return map
  // Em lotes de 200 — uma semana inteira pode ter milhares de atividades, e um único
  // filtro `in.(...)` com todos os ids de uma vez estoura o limite de tamanho da URL.
  const CHUNK = 200
  for (let i = 0; i < activityIds.length; i += CHUNK) {
    const lote = activityIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('activity_subetapas')
      .select('id,activity_id,nome,concluida')
      .in('activity_id', lote)
    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) return map
      throw new Error(error.message)
    }
    for (const s of (data ?? []) as SubEtapa[]) {
      if (!map.has(s.activity_id)) map.set(s.activity_id, [])
      map.get(s.activity_id)!.push(s)
    }
  }
  return map
}

// Buscar semana + atividades
export async function getWeek(isoYear: number, isoWeek: number): Promise<WeekData> {
  const week = await ensureWeek(isoYear, isoWeek)

  // Paginado pelo mesmo motivo de getActivitiesInDateRange: sem isso, o Supabase corta
  // na página default (1000 linhas), o que uma semana cheia de atividades pode passar.
  const PAGE_SIZE = 1000
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('week_id', week.id)
      .order('planned_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    activities.push(...((data ?? []) as ActivityRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'partial_weight')
    .maybeSingle()

  const partialWeight = setting && typeof setting.value === 'number' ? setting.value : 0.5

  const subetapasPorAtividade = await fetchSubetapasByActivity(activities.map((a) => a.id))

  // Atividades importadas (is_extra=false) ainda reaproveitam a coluna `area` pra
  // guardar a área (nível 2/3 da EDT) — sem coluna dedicada no banco. `company`
  // (Empresa) já é um campo "de verdade" tanto pra extras quanto pra importadas
  // (coletado na 2ª etapa da importação); o cronograma de origem tem coluna
  // própria (source_cronograma), ver programacao-empresa-migration.sql.
  const mappedActivities: ActivityLike[] = (activities ?? []).map((a: ActivityRow) => ({
    id: a.id,
    name: a.name,
    company: a.company,
    discipline: a.discipline,
    area: a.is_extra ? a.area : null,
    stage: a.stage,
    foreman: a.foreman,
    planned_date: a.planned_date,
    planned_pct: a.planned_pct,
    status: a.status,
    is_extra: a.is_extra,
    observation: a.observation,
    source: a.is_extra ? undefined : (a.source_cronograma ?? undefined),
    areaPath: a.is_extra ? null : a.area,
    taskUid: a.task_uid,
    subetapas: subetapasPorAtividade.get(a.id) ?? [],
    inativa: a.inativa,
    motivoInativacao: a.motivo_inativacao,
  }))

  return { week, activities: mappedActivities, partialWeight }
}

// Indicadores (PPC/aderência) numa janela de datas corrida — ex.: "últimos 21 dias" —
// em vez de uma semana ISO só. Usado pelo card "PPC" da Curva S. Reaproveita
// computeIndicators (mesma regra: concluídas / planejadas, extras não contam no
// denominador), só muda a query pra filtrar por intervalo de planned_date em vez de
// week_id.
export async function getActivitiesInDateRange(startDate: string, endDate: string): Promise<ActivityLike[]> {
  // Sem paginar, o Supabase corta na página default (1000 linhas) — um intervalo de 7
  // dias com várias dezenas de tarefas por dia passa disso fácil (cada tarefa gera 1
  // linha por dia sobreposto). Sem isso, a Programação Semanal só trazia as primeiras
  // ~1000 linhas (na prática, só o primeiro engenheiro em ordem de inserção).
  const PAGE_SIZE = 1000
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .gte('planned_date', startDate)
      .lte('planned_date', endDate)
      .order('planned_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    activities.push(...((data ?? []) as ActivityRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  const subetapasPorAtividade = await fetchSubetapasByActivity(activities.map((a) => a.id))

  return (activities ?? []).map((a: ActivityRow) => ({
    id: a.id,
    name: a.name,
    company: a.company,
    discipline: a.discipline,
    area: a.is_extra ? a.area : null,
    stage: a.stage,
    foreman: a.foreman,
    planned_date: a.planned_date,
    planned_pct: a.planned_pct,
    status: a.status,
    is_extra: a.is_extra,
    observation: a.observation,
    source: a.is_extra ? undefined : (a.source_cronograma ?? undefined),
    areaPath: a.is_extra ? null : a.area,
    taskUid: a.task_uid,
    subetapas: subetapasPorAtividade.get(a.id) ?? [],
    inativa: a.inativa,
    motivoInativacao: a.motivo_inativacao,
  }))
}

// Bloquear semana (reaproveita o status "consolidado" do banco — trocar o enum
// exigiria migração; só o rótulo na UI virou "Bloqueada")
export async function lockWeek(weekId: string): Promise<void> {
  const { error } = await supabase
    .from('weeks')
    .update({ status: 'consolidado', consolidated_at: new Date().toISOString() })
    .eq('id', weekId)

  if (error) throw new Error(error.message)
}

// Desbloquear semana — volta pro estado editável
export async function unlockWeek(weekId: string): Promise<void> {
  const { error } = await supabase
    .from('weeks')
    .update({ status: 'rascunho', consolidated_at: null })
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

// Inativar/reativar atividade — item colocado de lado pra análise (ex.: não fica
// claro por que não foi executado); sai do PPC/aderência enquanto estiver inativo
// (ver computeIndicators/computeSegment e buildRelatorioVisual/buildMatrizSemanal).
// Funciona mesmo com a semana bloqueada, igual às sub-etapas.
export async function setActivityInativa(activityId: string, inativa: boolean, motivo: string | null): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({ inativa, motivo_inativacao: inativa ? motivo : null })
    .eq('id', activityId)
  if (error) throw new Error(error.message)
}

// ============ Sub-etapas de uma atividade do dia ============
// Uma atividade (ex.: "Bypass") pode ser composta de frentes menores no mesmo
// dia (Armação, Concretagem, Bases, Montagem); cada uma é marcada concluída
// individualmente e o status da atividade passa a ser derivado delas — ver
// computeStatusFromSubetapas.

export async function addSubEtapa(activityId: string, nome: string): Promise<SubEtapa> {
  const { data, error } = await supabase
    .from('activity_subetapas')
    .insert({ activity_id: activityId, nome })
    .select('id,activity_id,nome,concluida')
    .single()
  if (error) throw new Error(error.message)
  return data as SubEtapa
}

export async function toggleSubEtapa(id: string, concluida: boolean): Promise<void> {
  const { error } = await supabase.from('activity_subetapas').update({ concluida }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteSubEtapa(id: string): Promise<void> {
  // .select() no delete pra saber se alguma linha foi de fato removida — um DELETE
  // bloqueado por RLS (USING não bate) não gera erro nenhum no Supabase, só afeta 0
  // linhas silenciosamente; sem essa checagem, o botão "excluir" parecia não fazer
  // nada e o usuário não tinha nenhum aviso do motivo.
  const { data, error } = await supabase.from('activity_subetapas').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível excluir a sub-etapa — verifique se seu nível de acesso é Edição')
}

/**
 * null = a atividade não tem sub-etapas (status continua manual, pelos 3 botões).
 * Regra por proporção concluída: todas -> concluída; metade ou mais (mas não todas)
 * -> parcial; menos da metade (mais da metade NÃO realizadas) -> não concluída.
 */
export function computeStatusFromSubetapas(subetapas: SubEtapa[]): ActivityStatus | null {
  if (subetapas.length === 0) return null
  const concluidas = subetapas.filter((s) => s.concluida).length
  const proporcao = concluidas / subetapas.length
  if (proporcao === 1) return 'concluida'
  if (proporcao >= 0.5) return 'parcial'
  return 'nao_concluida'
}

// Deletar atividade
export async function deleteActivity(activityId: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  if (error) throw new Error(error.message)
}

// Limpar semana — remove TODAS as atividades (extras e importadas) da semana
export async function clearWeekActivities(weekId: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('week_id', weekId)
  if (error) throw new Error(error.message)
}

// Limpar dia — remove TODAS as atividades (extras e importadas) de um dia específico
export async function clearDayActivities(weekId: string, plannedDate: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('week_id', weekId).eq('planned_date', plannedDate)
  if (error) throw new Error(error.message)
}

export interface NewActivityPayload {
  weekId: string
  planned_date: string
  name: string
  company?: string | null
  discipline?: string | null
  area?: string | null
  stage?: string | null
  foreman?: string | null
  observation?: string | null
  isExtra?: boolean
  sourceCronograma?: string | null
  areaPath?: string | null
  /** Área "de verdade" do cadastro Setor→Área→Etapa (setores/areas/subareas) —
   * vinculada manualmente em "Engenheiros por Área", não é criada automaticamente. */
  areaId?: string | null
  /** WBSActivity.uid da tarefa de origem no cronograma — permite depois buscar
   * atraso/% avanço/datas ao vivo do cronograma. Só faz sentido quando isExtra=false. */
  taskUid?: number | null
}

// Adicionar atividade extra (ou, com isExtra=false, uma atividade "oficial" vinda da
// importação do cronograma — distinção que a semana bloqueada usa pra saber o que
// pode continuar sendo adicionado/removido mesmo bloqueada: só as extras de verdade)
export async function addExtraActivity(payload: NewActivityPayload): Promise<void> {
  return addActivitiesBulk([payload])
}

// Inserir várias atividades numa única chamada — usado na importação, onde uma
// mesma atividade do cronograma pode gerar um registro por dia da semana que ela
// sobrepõe (a iniciar/em andamento/a concluir), em vez de um único dia.
export async function addActivitiesBulk(payloads: NewActivityPayload[]): Promise<void> {
  if (payloads.length === 0) return

  const rows = payloads.map((payload) => {
    const isExtra = payload.isExtra ?? true
    return {
      week_id: payload.weekId,
      name: payload.name,
      planned_date: payload.planned_date,
      is_extra: isExtra,
      // Empresa é um campo "de verdade" nos dois casos (extra ou importada — nesse
      // último caso, coletada na 2ª etapa do modal de importação). O cronograma de
      // origem tem coluna própria (source_cronograma); `area` ainda reaproveita a
      // área da EDT (nível 2/3) só nas importadas, sem coluna dedicada no banco.
      company: payload.company ?? null,
      source_cronograma: !isExtra ? (payload.sourceCronograma ?? null) : null,
      discipline: payload.discipline ?? null,
      area: isExtra ? (payload.area ?? null) : (payload.areaPath ?? null),
      area_id: payload.areaId ?? null,
      stage: payload.stage ?? null,
      foreman: payload.foreman ?? null,
      observation: payload.observation ?? null,
      planned_pct: 100,
      task_uid: !isExtra && payload.taskUid != null ? String(payload.taskUid) : null,
    }
  })

  const { error } = await supabase.from('activities').insert(rows)
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

// ============ Engenheiro responsável por Área (nível 2 da EDT) ============
// Cadastrado 1x por projeto — evita digitar o Engenheiro atividade por atividade
// toda semana na importação (ver ModalEngenheirosArea/ModalImportarAtividades).

export interface EngenheiroArea {
  id: string
  projeto_id: string
  area_nome: string
  engenheiro: string | null
  /** Área "de verdade" do cadastro Setor→Área→Etapa vinculada a essa área do
   * cronograma — escolhida manualmente, nunca criada sozinha (ver ModalEngenheirosArea). */
  area_id: string | null
}

export async function listEngenheirosArea(projetoId: string): Promise<EngenheiroArea[]> {
  const { data, error } = await supabase
    .from('programacao_engenheiros_area')
    .select('id,projeto_id,area_nome,engenheiro,area_id')
    .eq('projeto_id', projetoId)
  if (error) throw new Error(error.message)
  return data as EngenheiroArea[]
}

export async function upsertEngenheiroArea(projetoId: string, areaNome: string, engenheiro: string): Promise<void> {
  const { error } = await supabase
    .from('programacao_engenheiros_area')
    .upsert({ projeto_id: projetoId, area_nome: areaNome, engenheiro }, { onConflict: 'projeto_id,area_nome' })
  if (error) throw new Error(error.message)
}

export async function upsertAreaVinculada(projetoId: string, areaNome: string, areaId: string | null): Promise<void> {
  const { error } = await supabase
    .from('programacao_engenheiros_area')
    .upsert({ projeto_id: projetoId, area_nome: areaNome, area_id: areaId }, { onConflict: 'projeto_id,area_nome' })
  if (error) throw new Error(error.message)
}

export async function deleteEngenheiroArea(id: string): Promise<void> {
  const { error } = await supabase.from('programacao_engenheiros_area').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
