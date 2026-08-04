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
  mes: string
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

export async function listPlanejado(baselineId: string): Promise<PlanejadoRow[]> {
  const { data, error } = await supabase
    .from('histograma_planejado')
    .select('*')
    .eq('baseline_id', baselineId)
  if (error) throw new Error(error.message)
  return data as PlanejadoRow[]
}

export async function upsertPlanejado(baselineId: string, cargoId: string, mes: string, qtd: number): Promise<void> {
  const { error } = await supabase
    .from('histograma_planejado')
    .upsert({ baseline_id: baselineId, cargo_id: cargoId, mes, qtd_planejada: qtd }, { onConflict: 'baseline_id,cargo_id,mes' })
  if (error) throw new Error(error.message)
}

export async function listRealSemanal(projetoId: string): Promise<RealSemanalRow[]> {
  const { data, error } = await supabase
    .from('histograma_real_semanal')
    .select('*')
    .eq('projeto_id', projetoId)
  if (error) throw new Error(error.message)
  return data as RealSemanalRow[]
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
      .select('cargo_id, mes, qtd_planejada')
      .eq('baseline_id', baselineAtualId)
    if (errPlan) throw new Error(errPlan.message)

    if (planejadoAtual && planejadoAtual.length > 0) {
      const rows = planejadoAtual.map((p) => ({
        baseline_id: nova.id,
        cargo_id: p.cargo_id,
        mes: p.mes,
        qtd_planejada: p.qtd_planejada,
      }))
      const { error: errInsert } = await supabase.from('histograma_planejado').insert(rows)
      if (errInsert) throw new Error(errInsert.message)
    }
  }

  return nova as Baseline
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
