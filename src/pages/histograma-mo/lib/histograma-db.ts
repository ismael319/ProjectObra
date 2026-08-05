import { supabase } from '@/lib/supabase'
import { funcaoBase } from '@/lib/administracao/cargo-nivel'

const COMBINING_DIACRITICS = /[̀-ͯ]/g

// Mesma chave de comparação usada em src/lib/administracao/parse-shared.ts
// (normalizarTexto) — duplicada aqui, em vez de importada, pra não puxar o
// módulo de import de planilhas (que carrega a lib xlsx inteira) só por essa
// função.
export function normalizarNomeCargo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export type Categoria = 'D' | 'I'

export interface Cargo {
  id: string
  projeto_id: string
  nome: string
  tipo: 'MO' | 'EQUIPAMENTO'
  categoria: Categoria | null
  ordem: number
  ativo: boolean
}

export interface Baseline {
  id: string
  projeto_id: string
  versao: string
  descricao: string | null
  motivo: string | null
  data_aprovacao: string | null
  aprovado_por: string | null
  ativa: boolean
  criado_em: string
}

export interface PlanejadoRow {
  id: string
  baseline_id: string
  cargo_id: string
  semana_ref: string
  qtd_planejada: number
}

export interface RealSemanalRow {
  id: string
  projeto_id: string
  cargo_id: string
  semana_ref: string
  qtd_real: number
}

export async function listCargos(projetoId: string): Promise<Cargo[]> {
  const { data, error } = await supabase
    .from('histograma_cargos')
    .select('*')
    .eq('projeto_id', projetoId)
    .eq('ativo', true)
    .order('ordem')
  if (error) throw new Error(error.message)
  return data as Cargo[]
}

export async function criarCargo(projetoId: string, nome: string, categoria: Categoria | null, tipo: Cargo['tipo']): Promise<Cargo> {
  const { data, error } = await supabase
    .from('histograma_cargos')
    .insert({ projeto_id: projetoId, nome, categoria, tipo })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Cargo
}

export async function listBaselines(projetoId: string): Promise<Baseline[]> {
  const { data, error } = await supabase
    .from('histograma_baselines')
    .select('*')
    .eq('projeto_id', projetoId)
    .order('criado_em')
  if (error) throw new Error(error.message)
  return data as Baseline[]
}

// Paginado — o Supabase corta na página default (1000 linhas) sem isso. Desde que
// o Planejado passou a ser semanal (antes era 1 linha por mês por cargo, agora é 1
// por semana — ~4-5x mais linhas), projetos com bastante cargo cruzam esse limite
// fácil, e cargos "depois da linha 1000" (ordem não é garantida) simplesmente
// sumiam da tela mesmo com o dado certinho gravado no banco.
export async function listPlanejado(baselineId: string): Promise<PlanejadoRow[]> {
  const PAGE_SIZE = 1000
  const rows: PlanejadoRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('histograma_planejado')
      .select('*')
      .eq('baseline_id', baselineId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as PlanejadoRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export async function upsertPlanejado(baselineId: string, cargoId: string, semanaRef: string, qtd: number): Promise<void> {
  const { error } = await supabase
    .from('histograma_planejado')
    .upsert(
      { baseline_id: baselineId, cargo_id: cargoId, semana_ref: semanaRef, qtd_planejada: qtd },
      { onConflict: 'baseline_id,cargo_id,semana_ref' },
    )
  if (error) throw new Error(error.message)
}

// Mesmo motivo de listPlanejado acima — paginado pra não cortar em 1000 linhas.
export async function listRealSemanal(projetoId: string): Promise<RealSemanalRow[]> {
  const PAGE_SIZE = 1000
  const rows: RealSemanalRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('histograma_real_semanal')
      .select('*')
      .eq('projeto_id', projetoId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as RealSemanalRow[]))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export async function upsertReal(projetoId: string, cargoId: string, semanaRef: string, qtd: number): Promise<void> {
  const { error } = await supabase
    .from('histograma_real_semanal')
    .upsert(
      { projeto_id: projetoId, cargo_id: cargoId, semana_ref: semanaRef, qtd_real: qtd },
      { onConflict: 'cargo_id,semana_ref' },
    )
  if (error) throw new Error(error.message)
}

// Cria a próxima baseline (LB0, LB1, ...), ativa ela (o trigger no banco
// desativa a anterior) e copia o planejado da baseline atual como ponto de
// partida — mesmo comportamento do protótipo (criarNovaBaseline).
export async function criarBaseline(projetoId: string, baselineAtualId: string | null, motivo: string): Promise<Baseline> {
  const { count, error: errCount } = await supabase
    .from('histograma_baselines')
    .select('*', { count: 'exact', head: true })
    .eq('projeto_id', projetoId)
  if (errCount) throw new Error(errCount.message)

  const versao = `LB${count ?? 0}`
  const { data: nova, error } = await supabase
    .from('histograma_baselines')
    .insert({ projeto_id: projetoId, versao, descricao: `Revisão ${versao}`, motivo: motivo || null, ativa: true })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  if (baselineAtualId) {
    const { data: planejadoAtual, error: errPlan } = await supabase
      .from('histograma_planejado')
      .select('cargo_id, semana_ref, qtd_planejada')
      .eq('baseline_id', baselineAtualId)
    if (errPlan) throw new Error(errPlan.message)

    if (planejadoAtual && planejadoAtual.length > 0) {
      const rows = planejadoAtual.map((p) => ({
        baseline_id: nova.id,
        cargo_id: p.cargo_id,
        semana_ref: p.semana_ref,
        qtd_planejada: p.qtd_planejada,
      }))
      const { error: errInsert } = await supabase.from('histograma_planejado').insert(rows)
      if (errInsert) throw new Error(errInsert.message)
    }
  }

  return nova as Baseline
}

// Exclui uma baseline (LB0, LB1, ...) e, em cascata (FK ON DELETE CASCADE), todo o
// Planejado gravado nela — não mexe nos cargos nem no Real semanal (esses dois não
// são por baseline). Se a excluída for a única/ativa, o projeto volta ao estado
// "sem baseline" (mesma tela de "Nenhuma baseline cadastrada ainda").
export async function deleteBaseline(id: string): Promise<void> {
  const { error } = await supabase.from('histograma_baselines').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export interface ResultadoMesclagem {
  planejadoMovidos: number
  planejadoSomados: number
  realMovidos: number
  realSomados: number
}

// Move todo o Planejado e Real de um cargo "origem" (duplicado, ex.: criado sem
// querer por uma importação cujo nome na planilha não bateu com o cargo já
// cadastrado — ver aviso em ModalImportar/handleConfirmarImport) pro cargo
// "destino", e apaga o origem no final. Quando os dois já têm valor no mesmo
// mês/semana, SOMA em vez de sobrescrever — nenhum dos dois lançamentos se perde,
// já que não dá pra saber de antemão qual dos dois é "o certo".
export async function mesclarCargos(origemId: string, destinoId: string): Promise<ResultadoMesclagem> {
  if (origemId === destinoId) throw new Error('Selecione dois cargos diferentes pra mesclar.')

  const [{ data: planejadoOrigem, error: errPO }, { data: planejadoDestino, error: errPD }] = await Promise.all([
    supabase.from('histograma_planejado').select('id, baseline_id, semana_ref, qtd_planejada').eq('cargo_id', origemId),
    supabase.from('histograma_planejado').select('id, baseline_id, semana_ref, qtd_planejada').eq('cargo_id', destinoId),
  ])
  if (errPO) throw new Error(errPO.message)
  if (errPD) throw new Error(errPD.message)

  const planejadoDestinoPorChave = new Map((planejadoDestino ?? []).map((r) => [`${r.baseline_id}__${r.semana_ref}`, r]))
  let planejadoMovidos = 0
  let planejadoSomados = 0
  for (const row of planejadoOrigem ?? []) {
    const existente = planejadoDestinoPorChave.get(`${row.baseline_id}__${row.semana_ref}`)
    if (existente) {
      const { error } = await supabase
        .from('histograma_planejado')
        .update({ qtd_planejada: existente.qtd_planejada + row.qtd_planejada })
        .eq('id', existente.id)
      if (error) throw new Error(error.message)
      planejadoSomados++
    } else {
      const { error } = await supabase.from('histograma_planejado').update({ cargo_id: destinoId }).eq('id', row.id)
      if (error) throw new Error(error.message)
      planejadoMovidos++
    }
  }

  const [{ data: realOrigem, error: errRO }, { data: realDestino, error: errRD }] = await Promise.all([
    supabase.from('histograma_real_semanal').select('id, semana_ref, qtd_real').eq('cargo_id', origemId),
    supabase.from('histograma_real_semanal').select('id, semana_ref, qtd_real').eq('cargo_id', destinoId),
  ])
  if (errRO) throw new Error(errRO.message)
  if (errRD) throw new Error(errRD.message)

  const realDestinoPorSemana = new Map((realDestino ?? []).map((r) => [r.semana_ref, r]))
  let realMovidos = 0
  let realSomados = 0
  for (const row of realOrigem ?? []) {
    const existente = realDestinoPorSemana.get(row.semana_ref)
    if (existente) {
      const { error } = await supabase
        .from('histograma_real_semanal')
        .update({ qtd_real: existente.qtd_real + row.qtd_real })
        .eq('id', existente.id)
      if (error) throw new Error(error.message)
      realSomados++
    } else {
      const { error } = await supabase.from('histograma_real_semanal').update({ cargo_id: destinoId }).eq('id', row.id)
      if (error) throw new Error(error.message)
      realMovidos++
    }
  }

  // Sem mais nada apontando pro origem (tudo foi movido ou somado acima) — apaga
  // ele. Se sobrar algo por qualquer motivo, o FK ON DELETE CASCADE limpa junto.
  const { error: errDel } = await supabase.from('histograma_cargos').delete().eq('id', origemId)
  if (errDel) throw new Error(errDel.message)

  return { planejadoMovidos, planejadoSomados, realMovidos, realSomados }
}

// Zera os valores lançados (planejado da baseline ativa + real semanal do projeto
// inteiro, os dois tipos — Pessoas e Equipamentos) sem mexer nos cargos nem no
// histórico de baselines — usado quando os números foram lançados errado (ex.:
// importação malformada) e é mais rápido recomeçar a digitar do que corrigir linha
// a linha. Real não é por baseline (é por projeto/cargo/semana), por isso zera
// direto pelo projeto inteiro, não só a baseline ativa.
export async function zerarValoresHistograma(projetoId: string, baselineId: string): Promise<void> {
  const { error: errPlan } = await supabase.from('histograma_planejado').delete().eq('baseline_id', baselineId)
  if (errPlan) throw new Error(errPlan.message)

  const { error: errReal } = await supabase.from('histograma_real_semanal').delete().eq('projeto_id', projetoId)
  if (errReal) throw new Error(errReal.message)
}

// Funções (cargos) já cadastradas no Controle de Funcionários (rh_cargos),
// pra sugerir na hora de criar um cargo no Histograma — evita nome
// divergente ("Pedreiro" vs "pedreiro") do que já é usado lá, o que é
// justamente o que contarCadastroAtivoPorCargo casa por nome. Deduplicado
// por função base (funcaoBase) — "Pedreiro I"/"II"/"III" cadastrados como
// cargos separados em Administração viram uma sugestão única "Pedreiro",
// já que no Histograma o nível não importa pra contagem. Best-effort igual
// a contarCadastroAtivoPorCargo: se a organização não tem o módulo
// Administração (RLS zera a tabela) ou a migration ainda não rodou, só não
// sugere nada.
export async function listFuncoesAdministracao(organizacaoId: string): Promise<{ id: string; nome: string; categoria: Categoria | null }[]> {
  const { data, error } = await supabase
    .from('rh_cargos')
    .select('id, nome, categoria')
    .eq('organizacao_id', organizacaoId)
    .eq('ativo', true)
    .order('nome')
  if (error) return []

  const porFuncaoBase = new Map<string, { id: string; nome: string; categoria: Categoria | null }>()
  for (const cargo of data as { id: string; nome: string; categoria: Categoria | null }[]) {
    const base = funcaoBase(cargo.nome)
    if (!porFuncaoBase.has(normalizarNomeCargo(base))) porFuncaoBase.set(normalizarNomeCargo(base), { id: cargo.id, nome: base, categoria: cargo.categoria })
  }
  return [...porFuncaoBase.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Referência (não autoritativa): quantos funcionários cadastrados e ativos
// no Controle de Efetivo (módulo Administração) estão hoje vinculados a
// este projeto, por cargo — casado pelo nome do cargo (normalizado) contra
// histograma_cargos.nome. É um retrato do cadastro AGORA, não uma
// reconstrução histórica por semana (a tabela funcionarios não guarda
// snapshot semanal de quem estava ativo quando) — por isso só faz sentido
// como sugestão pra semana atual, nunca preencher sozinho um Real de
// semana passada.
export async function contarCadastroAtivoPorCargo(projetoId: string, organizacaoId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('funcionarios')
    .select('rh_cargos(nome)')
    .eq('projeto_id', projetoId)
    .eq('organizacao_id', organizacaoId)
    .eq('ativo', true)

  // Best-effort: a organização pode não ter o módulo Administração
  // habilitado (RLS filtra a tabela a zero linhas) ou essa migration pode
  // ainda não ter sido aplicada nesse ambiente — não faz sentido quebrar o
  // Histograma por causa disso, só deixar de mostrar a referência.
  if (error) return new Map()

  const contagem = new Map<string, number>()
  for (const row of (data ?? []) as unknown as { rh_cargos: { nome: string } | { nome: string }[] | null }[]) {
    const cargo = Array.isArray(row.rh_cargos) ? row.rh_cargos[0] : row.rh_cargos
    if (!cargo?.nome) continue
    // funcaoBase agrupa níveis do mesmo cargo ("Pedreiro I/II/III") numa só
    // chave — "30 pedreiros" independente do nível, igual ao Dashboard de
    // Administração.
    const chave = normalizarNomeCargo(funcaoBase(cargo.nome))
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  return contagem
}
