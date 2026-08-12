// Funções de operações CRUD para Programação Semanal.
// Adaptado do Weekly Craft Pro para usar Supabase client diretamente.

import { supabase } from './supabase'
import type {
  ActivityLike,
  ActivityStatus,
  SubEtapa,
  SubEtapaStatus,
  BaselineActivity as BaselineActivityCalc,
} from './adherence'
import { isoWeekFromParts, addDays, toISODateStr } from './iso-week'

/**
 * Ciclo de vida da semana.
 *
 * - `rascunho`     — montagem. Importa-se do cronograma, ajusta-se dia e
 *                    conjunto, marca-se o que fica "fora desta semana".
 *                    Não existe PPC: ninguém se comprometeu com nada ainda.
 * - `comprometida` — o plano foi congelado num baseline (comprometerSemana) e a
 *                    semana está rodando. Status é livre (é o dia a dia); mexer
 *                    no CONJUNTO deixa rastro na Análise Semanal.
 * - `consolidado`  — fechada. Nada mais muda; o PPC do que foi comprometido
 *                    fica congelado.
 *
 * O rótulo `consolidado` (em vez de `fechada`) vem do enum original do banco.
 */
export type WeekStatus = 'rascunho' | 'comprometida' | 'consolidado'

interface WeekRow {
  id: string
  iso_year: number
  iso_week: number
  start_date: string
  end_date: string
  status: WeekStatus
  consolidated_at: string | null
  created_at: string
  analise_semanal?: string | null
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
  is_extra_original: boolean
  observation: string | null
  actual_productivity: string | null
  inativa: boolean
  motivo_inativacao: string | null
  fora_do_plano: boolean
  motivo_fora: string | null
  created_at: string
  updated_at: string
}

export interface WeekData {
  week: WeekRow
  activities: ActivityLike[]
  partialWeight: number
  /** Plano comprometido da semana (vazio enquanto ela está em montagem).
   * Vem junto porque a tela precisa dele em três lugares — taxa de acerto de
   * cada dia (computeIndicatorsDia), selo "veio de outro dia" e o resumo da
   * Análise Semanal —, e buscar em cada um deles seria a mesma query repetida. */
  baseline: BaselineActivity[]
}

// Garante que a semana existe (Sex→Qui), criando ou corrigindo se necessário.
// organizacaoId isola a semana por empresa (UNIQUE(organizacao_id, iso_year, iso_week)).
async function ensureWeek(organizacaoId: string, isoYear: number, isoWeek: number): Promise<WeekRow> {
  const friday = isoWeekFromParts(isoYear, isoWeek)
  const thursday = addDays(friday, 6)
  const startDate = toISODateStr(friday)
  const endDate = toISODateStr(thursday)

  if (!organizacaoId) throw new Error('Organização não carregada — recarregue a página.')

  const { data: existing } = await supabase
    .from('weeks')
    .select('*')
    .eq('iso_year', isoYear)
    .eq('iso_week', isoWeek)
    .eq('organizacao_id', organizacaoId)
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
    .eq('organizacao_id', organizacaoId)
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
      organizacao_id: organizacaoId,
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
      .select('id,activity_id,nome,status')
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

/**
 * Peso da atividade "parcial" no cálculo de aderência (app_settings).
 *
 * Exportado porque a leitura vivia dentro de getWeek, e quem calculava aderência
 * fora da tela da semana (card de PPC da Curva S, Análise Semanal, card do dia)
 * acabava usando 0.5 fixo — bastava alguém mudar a configuração para a mesma
 * semana mostrar percentuais diferentes em telas diferentes.
 */
export async function getPartialWeight(): Promise<number> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'partial_weight')
    .maybeSingle()
  return data && typeof data.value === 'number' ? data.value : 0.5
}

// Buscar semana + atividades
export async function getWeek(organizacaoId: string, isoYear: number, isoWeek: number): Promise<WeekData> {
  if (!organizacaoId) throw new Error('Organização não carregada — recarregue a página.')
  const week = await ensureWeek(organizacaoId, isoYear, isoWeek)

  // Paginado pelo mesmo motivo de getActivitiesInDateRange: sem isso, o Supabase corta
  // na página default (1000 linhas), o que uma semana cheia de atividades pode passar.
  const PAGE_SIZE = 1000
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = supabase
      .from('activities')
      .select('id, name, company, discipline, area, stage, foreman, planned_date, planned_pct, status, is_extra, is_extra_original, observation, source_cronograma, task_uid, inativa, motivo_inativacao, fora_do_plano, motivo_fora')
      .eq('week_id', week.id)
      .eq('organizacao_id', organizacaoId)
      .order('planned_date', { ascending: true })
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    activities.push(...((data ?? []) as ActivityRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  const partialWeight = await getPartialWeight()

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
    // `area` (a coluna crua do banco) serve dois papéis — texto livre digitado à
    // mão numa atividade avulsa, ou "Nível2 / Nível3" da EDT numa importada — e já
    // tentamos duas vezes adivinhar qual é qual por uma flag (is_extra, depois
    // task_uid/source_cronograma) pra decidir se ecoa em `area` (chip de exibição)
    // ou em `areaPath` (usado pro agrupamento por área/subárea). Toda vez sobrava
    // alguma atividade antiga sem a flag esperada e a área/subárea sumia de novo
    // (ex.: "Edificações complementares" na mensagem de WhatsApp). Mais robusto:
    // não adivinhar — repassa o valor bruto pros dois, sempre. O único efeito
    // colateral é a atividade real também mostrar o chip "Área: Nível2 / Nível3"
    // redundante com a linha da EDT, cosmético, contra o risco de perder a
    // área/subárea de vez.
    area: a.area,
    stage: a.stage,
    foreman: a.foreman,
    planned_date: a.planned_date,
    planned_pct: a.planned_pct,
    status: a.status,
    is_extra: a.is_extra,
    isExtraOriginal: a.is_extra_original,
    observation: a.observation,
    source: a.source_cronograma ?? undefined,
    areaPath: a.area,
    taskUid: a.task_uid,
    subetapas: subetapasPorAtividade.get(a.id) ?? [],
    inativa: a.inativa,
    motivoInativacao: a.motivo_inativacao,
    foraDoPlano: a.fora_do_plano,
    motivoFora: a.motivo_fora,
  }))

  // Semana em montagem não tem plano congelado — evita a query em vez de
  // devolver uma lista vazia depois de ir ao banco à toa.
  const baseline =
    week.status === 'rascunho' ? [] : await getWeekBaseline(organizacaoId, week.id)

  return { week, activities: mappedActivities, partialWeight, baseline }
}

// Indicadores (PPC/aderência) numa janela de datas corrida — ex.: "últimos 21 dias" —
// em vez de uma semana ISO só. Usado pelo card "PPC" da Curva S. Reaproveita
// computeIndicators (mesma regra: concluídas / planejadas, extras não contam no
// denominador), só muda a query pra filtrar por intervalo de planned_date em vez de
// week_id.
export async function getActivitiesInDateRange(organizacaoId: string, startDate: string, endDate: string): Promise<ActivityLike[]> {
  if (!organizacaoId) throw new Error('Organização não carregada — recarregue a página.')

  // Sem paginar, o Supabase corta na página default (1000 linhas) — um intervalo de 7
  // dias com várias dezenas de tarefas por dia passa disso fácil (cada tarefa gera 1
  // linha por dia sobreposto). Sem isso, a Programação Semanal só trazia as primeiras
  // ~1000 linhas (na prática, só o primeiro engenheiro em ordem de inserção).
  const PAGE_SIZE = 1000
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = supabase
      .from('activities')
      .select('id, name, company, discipline, area, stage, foreman, planned_date, planned_pct, status, is_extra, is_extra_original, observation, source_cronograma, task_uid, inativa, motivo_inativacao, fora_do_plano, motivo_fora')
      .gte('planned_date', startDate)
      .lte('planned_date', endDate)
      .eq('organizacao_id', organizacaoId)
      .order('planned_date', { ascending: true })
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)

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
    // `area` (a coluna crua do banco) serve dois papéis — texto livre digitado à
    // mão numa atividade avulsa, ou "Nível2 / Nível3" da EDT numa importada — e já
    // tentamos duas vezes adivinhar qual é qual por uma flag (is_extra, depois
    // task_uid/source_cronograma) pra decidir se ecoa em `area` (chip de exibição)
    // ou em `areaPath` (usado pro agrupamento por área/subárea). Toda vez sobrava
    // alguma atividade antiga sem a flag esperada e a área/subárea sumia de novo
    // (ex.: "Edificações complementares" na mensagem de WhatsApp). Mais robusto:
    // não adivinhar — repassa o valor bruto pros dois, sempre. O único efeito
    // colateral é a atividade real também mostrar o chip "Área: Nível2 / Nível3"
    // redundante com a linha da EDT, cosmético, contra o risco de perder a
    // área/subárea de vez.
    area: a.area,
    stage: a.stage,
    foreman: a.foreman,
    planned_date: a.planned_date,
    planned_pct: a.planned_pct,
    status: a.status,
    is_extra: a.is_extra,
    isExtraOriginal: a.is_extra_original,
    observation: a.observation,
    source: a.source_cronograma ?? undefined,
    areaPath: a.area,
    taskUid: a.task_uid,
    subetapas: subetapasPorAtividade.get(a.id) ?? [],
    inativa: a.inativa,
    motivoInativacao: a.motivo_inativacao,
    foraDoPlano: a.fora_do_plano,
    motivoFora: a.motivo_fora,
  }))
}

// Bloquear semana (reaproveita o status "consolidado" do banco — trocar o enum
// exigiria migração; só o rótulo na UI virou "Bloqueada")
export async function lockWeek(organizacaoId: string, weekId: string): Promise<void> {
  // .select() pra saber se o UPDATE realmente afetou alguma linha — a RLS já
  // exige papel Edição no módulo Engenharia pra bloquear/desbloquear, mas sem
  // essa checagem um usuário sem permissão via um caminho fora da UI (ou uma
  // permissão que mudou nesse meio-tempo) não recebia nenhum aviso do motivo.
  const { data, error } = await supabase
    .from('weeks')
    .update({ status: 'consolidado', consolidated_at: new Date().toISOString() })
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível bloquear a semana — verifique se seu nível de acesso é Edição')
}

// Desbloquear semana — volta pra 'comprometida', NÃO pra 'rascunho': o plano da
// semana já foi assumido e o baseline continua valendo. Voltar pra rascunho (o
// que unlockWeekWithBaseline fazia, junto com apagar o baseline) fazia o
// compromisso sumir sem deixar rastro — bastava desbloquear e rebloquear pra
// gerar um baseline novo em cima do resultado.
export async function unlockWeek(organizacaoId: string, weekId: string): Promise<void> {
  const { data, error } = await supabase
    .from('weeks')
    .update({ status: 'comprometida', consolidated_at: null })
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível desbloquear a semana — verifique se seu nível de acesso é Edição')
}

/** Lê só o estado da semana — as funções de escrita precisam dele pra recusar
 * alteração em semana fechada, e nenhuma delas consultava esse campo. */
export async function getWeekStatus(organizacaoId: string, weekId: string): Promise<WeekStatus> {
  const { data, error } = await supabase
    .from('weeks')
    .select('status')
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Semana não encontrada.')
  return data.status as WeekStatus
}

export interface ResumoComprometimento {
  /** Entram no plano (viram baseline). */
  comprometidas: number
  /** Marcadas "fora desta semana" — ficam visíveis, fora do denominador. */
  foraDoPlano: number
}

/**
 * Prévia do que `comprometerSemana` vai congelar. Serve pro botão mostrar o
 * número antes de a pessoa clicar — comprometer é a decisão que passa a valer
 * pro PPC da semana inteira.
 */
export async function resumoComprometimento(
  organizacaoId: string,
  weekId: string,
): Promise<ResumoComprometimento> {
  const { data, error } = await supabase
    .from('activities')
    .select('fora_do_plano')
    .eq('week_id', weekId)
    .eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
  const linhas = data ?? []
  const foraDoPlano = linhas.filter((a) => a.fora_do_plano).length
  return { comprometidas: linhas.length - foraDoPlano, foraDoPlano }
}

/**
 * Congela o plano da semana: grava o baseline e move o estado pra
 * 'comprometida'.
 *
 * É a peça que faltava. Até aqui o baseline era gravado dentro de
 * `lockWeekWithBaseline`, ou seja, no FECHAMENTO da semana — copiando status já
 * preenchidos. O snapshot não era o plano de segunda, era uma fotocópia do
 * resultado, e o delta da Análise Semanal comparava o fechamento com ele mesmo.
 *
 * Atividades marcadas "fora desta semana" ficam de fora do snapshot: é o que
 * tira a tarefa pausada do denominador sem precisar abusar de `Inativa`.
 */
export async function comprometerSemana(organizacaoId: string, weekId: string): Promise<void> {
  const status = await getWeekStatus(organizacaoId, weekId)
  if (status === 'consolidado') {
    throw new Error('A semana está fechada. Desbloqueie antes de comprometer novamente.')
  }
  if (status === 'comprometida') {
    throw new Error('Esta semana já foi comprometida — o plano dela já está congelado.')
  }

  const { comprometidas } = await resumoComprometimento(organizacaoId, weekId)
  if (comprometidas === 0) {
    throw new Error(
      'Nenhuma atividade entra no plano desta semana. Importe do cronograma ou desmarque algum item de "fora desta semana".',
    )
  }

  // Baseline primeiro: se a mudança de estado falhar (permissão), a semana
  // continua em rascunho e dá pra tentar de novo. Na ordem inversa a semana
  // ficaria 'comprometida' sem plano congelado — o pior dos estados.
  await saveWeekBaseline(organizacaoId, weekId)

  const { data, error } = await supabase
    .from('weeks')
    .update({ status: 'comprometida' })
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Não foi possível comprometer a semana — verifique se seu nível de acesso é Edição')
  }
}

/**
 * Volta a semana pra montagem e apaga o baseline. Existe pra corrigir um
 * comprometimento feito por engano — é destrutivo (o plano assumido some), então
 * a UI pede confirmação explícita.
 */
export async function reabrirParaMontagem(organizacaoId: string, weekId: string): Promise<void> {
  const status = await getWeekStatus(organizacaoId, weekId)
  if (status === 'consolidado') {
    throw new Error('A semana está fechada. Desbloqueie antes de voltar pra montagem.')
  }

  const { data, error } = await supabase
    .from('weeks')
    .update({ status: 'rascunho' })
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Não foi possível reabrir a semana — verifique se seu nível de acesso é Edição')
  }

  await clearWeekBaseline(organizacaoId, weekId)
}

/**
 * Marca (ou desmarca) uma atividade como "fora desta semana".
 *
 * Só faz sentido antes de comprometer: depois disso o conjunto já foi assumido e
 * o caminho pro imprevisto é `setActivityInativa`, que deixa rastro na análise.
 */
export async function setActivityForaDoPlano(
  organizacaoId: string,
  activityId: string,
  fora: boolean,
  motivo?: string | null,
): Promise<void> {
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'plano')
  const { data, error } = await supabase
    .from('activities')
    .update({ fora_do_plano: fora, motivo_fora: fora ? (motivo ?? null) : null })
    .eq('id', activityId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Não foi possível atualizar a atividade — verifique se seu nível de acesso é Edição')
  }
}

// Atualizar status de atividade
/**
 * Que tipo de escrita está sendo tentada — determina em quais estados da semana
 * ela é permitida.
 *
 * - `status`   — apontar o que aconteceu (concluída/parcial/não concluída,
 *                sub-etapas, observação). É o dia a dia: liberado enquanto a
 *                semana não fechar.
 * - `conjunto` — mexer em QUAIS atividades existem e em que dia (adicionar,
 *                excluir, mover, marcar Extra/Inativa). Também liberado até
 *                fechar, mas numa semana comprometida a diferença contra o
 *                baseline aparece na Análise Semanal e no delta do PPC.
 * - `plano`    — definir o plano em si (marcar "fora desta semana"). Só antes de
 *                comprometer: depois disso o conjunto já foi assumido, e o
 *                caminho pro imprevisto é inativar, que deixa rastro.
 */
type TipoEscrita = 'status' | 'conjunto' | 'plano'

const MSG_FECHADA: Record<TipoEscrita, string> = {
  status: 'A semana está fechada — desbloqueie no menu "Ações" para apontar status.',
  conjunto: 'A semana está fechada — desbloqueie no menu "Ações" para alterar as atividades.',
  plano: 'A semana está fechada — desbloqueie no menu "Ações" para alterar o plano.',
}

/**
 * Recusa a escrita quando o estado da semana não a permite.
 *
 * Nenhuma função de escrita consultava `weeks.status`: a trava existia só como
 * `disabled` em alguns botões, e vários caminhos (sub-etapas, mover atividade,
 * importar) editavam semana fechada sem barreira nenhuma — contrariando o
 * tooltip do WeekBar, que promete que fechar trava os status.
 */
async function exigirEscritaPermitida(
  organizacaoId: string,
  weekId: string,
  tipo: TipoEscrita,
): Promise<void> {
  const status = await getWeekStatus(organizacaoId, weekId)
  if (status === 'consolidado') throw new Error(MSG_FECHADA[tipo])
  if (tipo === 'plano' && status === 'comprometida') {
    throw new Error(
      'A semana já foi comprometida — o plano dela está congelado. Para tirar uma atividade da conta agora, inative-a informando o motivo (fica registrado na Análise Semanal).',
    )
  }
}

/** Mesma checagem, quando só se tem o id da atividade. */
async function exigirEscritaPermitidaPorAtividade(
  organizacaoId: string,
  activityId: string,
  tipo: TipoEscrita,
): Promise<void> {
  const { data, error } = await supabase
    .from('activities')
    .select('week_id')
    .eq('id', activityId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  // Atividade inexistente (ou invisível pela RLS): deixa a própria escrita
  // falhar com a mensagem de permissão dela, que é mais precisa que um genérico
  // daqui.
  if (!data) return
  await exigirEscritaPermitida(organizacaoId, data.week_id as string, tipo)
}

export async function setActivityStatus(
  organizacaoId: string,
  activityId: string,
  status: ActivityStatus,
  observation?: string | null,
): Promise<void> {
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'status')

  const patch: { status: ActivityStatus; observation?: string | null } = { status }
  if (observation !== undefined) patch.observation = observation

  // .select() pra saber se o UPDATE realmente afetou alguma linha — um UPDATE
  // bloqueado por RLS (USING não bate) não gera erro nenhum no Supabase, só
  // afeta 0 linhas silenciosamente (mesmo caso já resolvido em
  // deleteSubEtapa); sem essa checagem, o item principal parecia não
  // acompanhar o status calculado a partir das sub-etapas, sem nenhum aviso
  // do motivo.
  const { data, error } = await supabase
    .from('activities')
    .update(patch)
    .eq('id', activityId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível atualizar o status — verifique se seu nível de acesso é Edição')
}

// Inativar/reativar atividade — item colocado de lado pra análise (ex.: não fica
// claro por que não foi executado); sai do PPC/aderência ATUAL enquanto estiver
// inativo (ver computeIndicators/computeSegment e buildRelatorioVisual/
// buildMatrizSemanal). Numa semana comprometida NÃO sai do PPC comprometido: o
// item já fazia parte do plano assumido (ver computeIndicatorsComprometido), e é
// essa diferença que a Análise Semanal mostra.
export async function setActivityInativa(organizacaoId: string, activityId: string, inativa: boolean, motivo: string | null): Promise<void> {
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'conjunto')
  const { data, error } = await supabase
    .from('activities')
    .update({ inativa, motivo_inativacao: inativa ? motivo : null })
    .eq('id', activityId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível atualizar — verifique se seu nível de acesso é Edição')
}

// Marca/desmarca uma atividade como "Extra" (não estava planejada pro dia, mas foi
// feita mesmo assim) — controlado manualmente pelo usuário via botão, não é mais
// deduzido automaticamente na importação. Só mexe no status: não altera
// source_cronograma/area/task_uid, então uma atividade real do cronograma marcada
// extra continua agrupada no cronograma dela (ver addActivitiesBulk).
export async function setActivityExtra(organizacaoId: string, activityId: string, isExtra: boolean): Promise<void> {
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'conjunto')
  const { data, error } = await supabase
    .from('activities')
    .update({ is_extra: isExtra })
    .eq('id', activityId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível atualizar — verifique se seu nível de acesso é Edição')
}

// Move uma ou mais atividades já existentes pra outro dia (não cria linha nova) —
// usado tanto pelo "Reprogramar" (1 id) quanto pelo "Adicionar atividades não
// realizadas" (vários ids de uma vez, trazendo pendências de dias anteriores da
// mesma semana pro dia de hoje). Quem chama é responsável por só oferecer dias
// dentro da semana carregada.
export async function moverAtividadesParaDia(organizacaoId: string, activityIds: string[], novaData: string): Promise<void> {
  if (activityIds.length === 0) return
  // Todos os ids vêm sempre da mesma semana (a carregada na tela), então checar
  // o primeiro basta pra decidir se a escrita é permitida.
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityIds[0], 'conjunto')
  const { error } = await supabase
    .from('activities')
    .update({ planned_date: novaData })
    .in('id', activityIds)
    .eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

// "Finalizado 100%": marca concluída e remove os dias FUTUROS da mesma semana que
// ainda estavam programados pra essa mesma tarefa do cronograma (mesmo task_uid) —
// uma atividade concluída antes do previsto não deve continuar aparecendo como
// pendente nos dias seguintes, inflando a aderência desses dias com um trabalho que
// já não existe mais. Nunca mexe em dias passados: os ids a remover já vêm
// calculados pelo chamador (só dias com planned_date > o dia da atividade finalizada).
export async function finalizarAtividade(organizacaoId: string, activityId: string, idsDiasFuturos: string[], observation?: string | null): Promise<void> {
  await setActivityStatus(organizacaoId, activityId, 'concluida', observation ?? null)
  if (idsDiasFuturos.length === 0) return
  const { error } = await supabase.from('activities').delete().in('id', idsDiasFuturos).eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

// ============ Sub-etapas de uma atividade do dia ============
// Uma atividade (ex.: "Bypass") pode ser composta de frentes menores no mesmo
// dia (Armação, Concretagem, Bases, Montagem); cada uma é marcada concluída
// individualmente e o status da atividade passa a ser derivado delas — ver
// computeStatusFromSubetapas.

export async function addSubEtapa(organizacaoId: string, activityId: string, nome: string): Promise<SubEtapa> {
  if (!organizacaoId) throw new Error('Organização não carregada — recarregue a página.')
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'status')
  const { data, error } = await supabase
    .from('activity_subetapas')
    .insert({ organizacao_id: organizacaoId, activity_id: activityId, nome })
    .select('id,activity_id,nome,status')
    .single()
  if (error) throw new Error(error.message)
  return data as SubEtapa
}

/**
 * Sub-etapas de UMA atividade, direto do banco.
 *
 * Existe pra quem precisa do estado recém-gravado sem esperar o refetch da
 * semana inteira chegar por prop — ver sincronizarStatus em ModalDetalheDia.
 */
export async function listSubEtapas(organizacaoId: string, activityId: string): Promise<SubEtapa[]> {
  const { data, error } = await supabase
    .from('activity_subetapas')
    .select('id,activity_id,nome,status')
    .eq('activity_id', activityId)
    .eq('organizacao_id', organizacaoId)
  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) return []
    throw new Error(error.message)
  }
  return (data ?? []) as SubEtapa[]
}

/** Resolve a atividade dona da sub-etapa pra poder aplicar a trava da semana. */
async function exigirEscritaPermitidaPorSubEtapa(
  organizacaoId: string,
  subEtapaId: string,
  tipo: TipoEscrita,
): Promise<void> {
  const { data, error } = await supabase
    .from('activity_subetapas')
    .select('activity_id')
    .eq('id', subEtapaId)
    .eq('organizacao_id', organizacaoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return
  await exigirEscritaPermitidaPorAtividade(organizacaoId, data.activity_id as string, tipo)
}

export async function setSubEtapaStatus(organizacaoId: string, id: string, status: SubEtapaStatus): Promise<void> {
  await exigirEscritaPermitidaPorSubEtapa(organizacaoId, id, 'status')
  // .select() pelo mesmo motivo de deleteSubEtapa e setActivityStatus: um UPDATE
  // barrado por RLS não gera erro no Supabase, só afeta 0 linhas em silêncio.
  // Sem isso, marcar a sub-etapa "funcionava" na tela (o estado local mudava),
  // o status da atividade era calculado em cima de um dado que nunca chegou ao
  // banco, e no refetch tudo voltava ao que era — sem nenhum aviso.
  const { data, error } = await supabase
    .from('activity_subetapas')
    .update({ status })
    .eq('id', id)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível marcar a sub-etapa — verifique se seu nível de acesso é Edição')
}

export async function deleteSubEtapa(organizacaoId: string, id: string): Promise<void> {
  await exigirEscritaPermitidaPorSubEtapa(organizacaoId, id, 'status')
  // .select() no delete pra saber se alguma linha foi de fato removida — um DELETE
  // bloqueado por RLS (USING não bate) não gera erro nenhum no Supabase, só afeta 0
  // linhas silenciosamente; sem essa checagem, o botão "excluir" parecia não fazer
  // nada e o usuário não tinha nenhum aviso do motivo.
  const { data, error } = await supabase
    .from('activity_subetapas')
    .delete()
    .eq('id', id)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível excluir a sub-etapa — verifique se seu nível de acesso é Edição')
}

/**
 * null = não dá pra derivar o status da atividade ainda — ou não tem sub-etapas
 * (status continua manual, pelos 3 botões), ou ainda tem alguma sub-etapa
 * "pendente" (nem marcada concluída nem não concluída — ex.: uma sub-etapa
 * prevista pra mais tarde no dia). Uma sub-etapa pendente NÃO conta como "não
 * concluída": ela simplesmente aguarda até ser resolvida, em vez de arrastar a
 * atividade pra "não concluída"/"parcial" antes da hora.
 * Só depois que todas as sub-etapas estiverem resolvidas (concluída ou não) é que
 * a proporção decide: todas concluídas -> concluída; metade ou mais (mas não
 * todas) -> parcial; menos da metade -> não concluída.
 */
export function computeStatusFromSubetapas(subetapas: SubEtapa[]): ActivityStatus | null {
  if (subetapas.length === 0) return null
  if (subetapas.some((s) => s.status === 'pendente')) return null
  const concluidas = subetapas.filter((s) => s.status === 'concluida').length
  const proporcao = concluidas / subetapas.length
  if (proporcao === 1) return 'concluida'
  if (proporcao >= 0.5) return 'parcial'
  return 'nao_concluida'
}

// Deletar atividade. Numa semana comprometida a linha some do quadro, mas NÃO do
// denominador do PPC comprometido: ela continua no baseline e passa a contar como
// não concluída (ver computeIndicatorsComprometido). Sem isso, apagar a linha
// seria a forma mais fácil de subir o indicador.
export async function deleteActivity(organizacaoId: string, activityId: string): Promise<void> {
  await exigirEscritaPermitidaPorAtividade(organizacaoId, activityId, 'conjunto')
  const { error } = await supabase.from('activities').delete().eq('id', activityId).eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

// Limpar semana — remove TODAS as atividades (extras e importadas) da semana
export async function clearWeekActivities(organizacaoId: string, weekId: string): Promise<void> {
  await exigirEscritaPermitida(organizacaoId, weekId, 'conjunto')
  const { error } = await supabase.from('activities').delete().eq('week_id', weekId).eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

// Limpar dia — remove TODAS as atividades (extras e importadas) de um dia específico
export async function clearDayActivities(organizacaoId: string, weekId: string, plannedDate: string): Promise<void> {
  await exigirEscritaPermitida(organizacaoId, weekId, 'conjunto')
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('week_id', weekId)
    .eq('planned_date', plannedDate)
    .eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

export interface NewActivityPayload {
  organizacaoId: string
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
  /** WBSActivity.uid da tarefa de origem no cronograma — presente quando a atividade
   * veio de um cronograma de verdade (independente de "extra"), permite depois
   * buscar atraso/% avanço/datas ao vivo do cronograma. */
  taskUid?: number | null
}

// Adicionar atividade extra (ou, com isExtra=false, uma atividade "oficial" vinda da
// importação do cronograma — is_extra é só um status/flag de exibição hoje, "não
// estava planejada pro dia mas foi feita"; não decide mais se a atividade tem
// vínculo real com um cronograma — isso quem decide é taskUid/sourceCronograma)
export async function addExtraActivity(payload: NewActivityPayload): Promise<void> {
  return addActivitiesBulk([payload])
}

// Inserir várias atividades numa única chamada — usado na importação, onde uma
// mesma atividade do cronograma pode gerar um registro por dia da semana que ela
// sobrepõe (a iniciar/em andamento/a concluir), em vez de um único dia.
export async function addActivitiesBulk(payloads: NewActivityPayload[]): Promise<void> {
  if (payloads.length === 0) return

  // organizacao_id é NOT NULL em activities (ver 20260807030000_programacao-
  // isolamento-org-migration.sql) — sem essa checagem, um organizacaoId vazio
  // (ex.: userProfile ainda não carregado) chega ao Supabase como valor
  // ausente e estoura um 400 cru de "violates not-null constraint" em vez de
  // um erro legível pro usuário.
  if (payloads.some((p) => !p.organizacaoId)) {
    throw new Error('Organização não carregada — recarregue a página antes de importar atividades.')
  }

  // Toda importação/inclusão cai numa única semana (a carregada na tela).
  await exigirEscritaPermitida(payloads[0].organizacaoId, payloads[0].weekId, 'conjunto')

  const rows = payloads.map((payload) => {
    const isExtra = payload.isExtra ?? true
    // Provém de um cronograma de verdade ou é uma atividade avulsa (digitada à
    // mão, sem vínculo)? Essa distinção decide o que fazer com
    // source_cronograma/area/task_uid — é independente de is_extra: uma atividade
    // vinda do cronograma continua tendo o cronograma de origem mesmo quando
    // marcada como extra (não estava planejada pro dia, mas é uma tarefa real),
    // senão ela perde o agrupamento por cronograma e cai no grupo genérico à toa.
    // sourceCronograma (não taskUid) decide isso — mesmo motivo do lado da
    // leitura em getWeek/getActivitiesInDateRange: taskUid é opcional mesmo em
    // atividades reais (pode faltar em fluxos antigos), sourceCronograma não.
    const isReal = !!payload.sourceCronograma
    return {
      organizacao_id: payload.organizacaoId,
      week_id: payload.weekId,
      name: payload.name,
      planned_date: payload.planned_date,
      is_extra: isExtra,
      // Retrato de is_extra travado na criação — setActivityExtra só mexe em
      // is_extra depois, nunca nesta coluna (ver computeIndicatorsCronograma).
      is_extra_original: isExtra,
      // Empresa é um campo "de verdade" nos dois casos (extra ou importada — nesse
      // último caso, coletada na 2ª etapa do modal de importação). O cronograma de
      // origem tem coluna própria (source_cronograma); `area` ainda reaproveita a
      // área da EDT (nível 2/3) só nas importadas, sem coluna dedicada no banco.
      company: payload.company ?? null,
      source_cronograma: isReal ? (payload.sourceCronograma ?? null) : null,
      discipline: payload.discipline ?? null,
      area: isReal ? (payload.areaPath ?? null) : (payload.area ?? null),
      area_id: payload.areaId ?? null,
      stage: payload.stage ?? null,
      foreman: payload.foreman ?? null,
      observation: payload.observation ?? null,
      planned_pct: 100,
      task_uid: isReal ? String(payload.taskUid) : null,
    }
  })

  const { error } = await supabase.from('activities').insert(rows)
  if (error) throw new Error(error.message)
}

export interface MergeExcelResult {
  updated: number
  /** Linhas da planilha sem a coluna UID preenchida. */
  semUid: number
  /** Linhas com UID que não corresponde a nenhuma atividade desta semana
   * (planilha de outra semana, ou UID editado à mão). */
  naoEncontradas: number
}

// Merge Excel: atualizar status via planilha
export async function mergeExcel(
  organizacaoId: string,
  weekId: string,
  rows: Array<Record<string, string | number | null>>,
): Promise<MergeExcelResult> {
  if (!organizacaoId) throw new Error('Organização não carregada — recarregue a página.')
  // Importar planilha é apontar status em massa — mesma regra do apontamento
  // manual, e o caminho mais fácil de esquecer de travar.
  await exigirEscritaPermitida(organizacaoId, weekId, 'status')

  const { data: existing } = await supabase
    .from('activities')
    .select('id, task_uid, status, observation, actual_productivity')
    .eq('week_id', weekId)
    .eq('organizacao_id', organizacaoId)

  // A coluna UID da planilha exportada carrega o `id` da linha (ver
  // handleExportExcel em DailyProgramming). Indexar só por task_uid fazia o
  // round-trip exportar → importar casar ZERO linhas, sempre, em silêncio.
  //
  // O id é a chave certa também porque task_uid NÃO é único: uma tarefa do
  // cronograma que atravessa 3 dias vira 3 linhas com o mesmo task_uid (ver
  // getOverlappingDays em ModalImportarAtividades), e por task_uid só uma delas
  // seria alcançável. task_uid fica como fallback para planilhas montadas à mão
  // a partir do cronograma.
  //
  // Sem anotar como ActivityRow: o select acima é parcial (5 colunas), então o
  // tipo inferido é o que realmente vem do banco.
  const byId = new Map((existing ?? []).map((a) => [a.id as string, a] as const))
  const byTaskUid = new Map(
    (existing ?? []).filter((a) => a.task_uid).map((a) => [a.task_uid as string, a] as const),
  )

  const STATUS_MAP: Record<string, ActivityStatus> = {
    concluida: 'concluida',
    'concluída': 'concluida',
    parcial: 'parcial',
    nao_concluida: 'nao_concluida',
    'não concluída': 'nao_concluida',
    'nao concluida': 'nao_concluida',
    pendente: 'pendente',
  }

  // Um upsert por linha (id já existe pra todas — vieram de byId/byTaskUid) em
  // vez de um UPDATE por linha: mesmo resultado, sem N chamadas de rede pra
  // planilhas grandes.
  const patches: Record<string, unknown>[] = []
  let semUid = 0
  let naoEncontradas = 0
  for (const raw of rows) {
    const uid = String(raw.UID ?? raw.uid ?? '').trim()
    if (!uid) {
      semUid += 1
      continue
    }

    const target = byId.get(uid) ?? byTaskUid.get(uid)
    if (!target) {
      naoEncontradas += 1
      continue
    }

    const rawStatus = String(raw.Status ?? raw.status ?? '').trim().toLowerCase()
    const st = STATUS_MAP[rawStatus] ?? (target as ActivityRow).status

    patches.push({
      id: target.id,
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
    })
  }

  if (patches.length === 0) return { updated: 0, semUid, naoEncontradas }

  const TAMANHO_LOTE = 500
  for (let i = 0; i < patches.length; i += TAMANHO_LOTE) {
    const lote = patches.slice(i, i + TAMANHO_LOTE)
    const { error } = await supabase.from('activities').upsert(lote, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }

  return { updated: patches.length, semUid, naoEncontradas }
}

/** Texto do resultado da importação por planilha. Fora do mergeExcel pra poder
 * testar sem banco. Existe porque "0 atividade(s) atualizada(s)" não dizia se a
 * planilha estava sem a coluna UID, se era de outra semana, ou se realmente não
 * havia nada pra mudar. */
export function descreverMergeExcel(r: MergeExcelResult): { texto: string; ok: boolean } {
  const partes = [`${r.updated} atividade(s) atualizada(s)`]
  if (r.naoEncontradas > 0) {
    partes.push(`${r.naoEncontradas} linha(s) com UID que não existe nesta semana`)
  }
  if (r.semUid > 0) partes.push(`${r.semUid} linha(s) sem UID`)

  if (r.updated === 0 && r.naoEncontradas + r.semUid > 0) {
    return {
      ok: false,
      texto: `Nenhuma atividade foi atualizada — ${partes.slice(1).join(' e ')}. Exporte a planilha desta semana pelo botão "Exportar Excel" e preencha por cima, sem mexer na coluna UID.`,
    }
  }
  return { ok: true, texto: partes.join('; ') + '.' }
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

// ============ Baseline da Programação Semanal ============
// Snapshot do PLANO no momento em que a semana é comprometida — define o
// conjunto contra o qual o PPC é medido (ver computeIndicatorsComprometido) e,
// via planned_date, a taxa de acerto de cada dia (computeIndicatorsDia).

/**
 * Linha de week_baseline como vem do banco: estende o tipo que o cálculo usa,
 * acrescentando as colunas que só a exibição precisa.
 *
 * Estende em vez de redeclarar porque havia duas definições independentes de
 * `BaselineActivity` (uma aqui, outra em adherence.ts) — os campos novos do
 * cálculo entravam numa e não na outra, e só o tipo estrutural do TypeScript
 * evitava o erro.
 */
export interface BaselineActivity extends BaselineActivityCalc {
  company: string | null
  discipline: string | null
  area: string | null
  stage: string | null
  foreman: string | null
  planned_pct: number
  source_cronograma: string | null
  task_uid: string | null
}

/**
 * Copia o PLANO da semana para week_baseline (chamada por comprometerSemana).
 *
 * "Plano" exclui as atividades marcadas "fora desta semana" — elas vieram do
 * cronograma por data, não por decisão. É esse filtro que dispensa o uso de
 * `Inativa` como remendo.
 */
export async function saveWeekBaseline(organizacaoId: string, weekId: string): Promise<void> {
  // Primeiro limpa baseline anterior
  const { error: delError } = await supabase
    .from('week_baseline')
    .delete()
    .eq('week_id', weekId)
    .eq('organizacao_id', organizacaoId)
  if (delError) throw new Error(delError.message)

  // Busca atividades atuais
  const PAGE_SIZE = 1000
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('activities')
      .select('id, name, company, discipline, area, stage, foreman, planned_date, planned_pct, status, is_extra, is_extra_original, inativa, source_cronograma, task_uid')
      .eq('week_id', weekId)
      .eq('organizacao_id', organizacaoId)
      .eq('fora_do_plano', false)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    activities.push(...((data ?? []) as ActivityRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }

  if (activities.length === 0) return

  // Insere em lotes
  const rows = activities.map(a => ({
    week_id: weekId,
    organizacao_id: organizacaoId,
    activity_id: a.id,
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
    source_cronograma: a.source_cronograma,
    task_uid: a.task_uid,
    inativa: a.inativa,
    is_extra_original: a.is_extra_original ?? a.is_extra,
  }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const lote = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('week_baseline').insert(lote)
    if (error) throw new Error(error.message)
  }
}

// Limpar baseline (chamada ao desbloquear)
export async function clearWeekBaseline(organizacaoId: string, weekId: string): Promise<void> {
  const { error } = await supabase
    .from('week_baseline')
    .delete()
    .eq('week_id', weekId)
    .eq('organizacao_id', organizacaoId)
  if (error) throw new Error(error.message)
}

// Buscar baseline da semana
export async function getWeekBaseline(organizacaoId: string, weekId: string): Promise<BaselineActivity[]> {
  const PAGE_SIZE = 1000
  const items: BaselineActivity[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('week_baseline')
      .select('*')
      .eq('week_id', weekId)
      .eq('organizacao_id', organizacaoId)
      .order('planned_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    items.push(...((data ?? []) as BaselineActivity[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return items
}

// ============ Análise Semanal ============

export interface WeekAnalysisItem {
  activity_id: string
  activity_name: string
  planned_date: string | null
  baseline_date: string | null
  baseline_status: string | null
  current_status: string
  is_extra: boolean
  was_reprogrammed: boolean
  was_added_after_lock: boolean
  was_removed_after_lock: boolean
}

// Buscar análise da semana via function SQL
export async function getWeekAnalysis(organizacaoId: string, weekId: string): Promise<WeekAnalysisItem[]> {
  const { data, error } = await supabase
    .rpc('get_week_analysis', {
      p_week_id: weekId,
      p_organizacao_id: organizacaoId,
    })
  if (error) throw new Error(error.message)
  return (data ?? []) as WeekAnalysisItem[]
}

// Atualizar campo de análise semanal
export async function updateWeekAnalise(organizacaoId: string, weekId: string, analise: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('weeks')
    .update({ analise_semanal: analise })
    .eq('id', weekId)
    .eq('organizacao_id', organizacaoId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Não foi possível salvar a análise — verifique se seu nível de acesso é Edição')
}

/**
 * Fecha a semana.
 *
 * NÃO grava mais baseline — esse era o erro central do módulo. Gravar aqui
 * significava fotografar o resultado e chamar isso de plano; o baseline agora
 * nasce em `comprometerSemana`, no início da semana.
 *
 * Fechar exige a semana comprometida: sem plano congelado não há o que medir.
 */
export async function lockWeekWithBaseline(organizacaoId: string, weekId: string): Promise<void> {
  const status = await getWeekStatus(organizacaoId, weekId)
  if (status === 'rascunho') {
    throw new Error(
      'Comprometa a semana antes de fechar — sem o plano congelado não há PPC pra medir.',
    )
  }
  await lockWeek(organizacaoId, weekId)
}

/**
 * Reabre a semana fechada: volta pra 'comprometida' e **mantém o baseline**.
 *
 * Antes, desbloquear apagava o baseline e voltava pra rascunho, então
 * desbloquear + rebloquear gerava um plano novo em cima do resultado já
 * conhecido, sem deixar rastro nenhum. Pra descartar o plano de fato existe
 * `reabrirParaMontagem`, que é explícito.
 */
export async function unlockWeekWithBaseline(organizacaoId: string, weekId: string): Promise<void> {
  await unlockWeek(organizacaoId, weekId)
}
