import { supabase } from '@/lib/supabase'
import type { Frente, ItemLista, ItemProgresso, LinhaImportada } from './types'

interface FrenteRow {
  id: string
  nome: string
  ativo: boolean
}

function rowToFrente(row: FrenteRow): Frente {
  return { id: row.id, nome: row.nome, ativo: row.ativo }
}

interface ItemRow {
  id: string
  frente_id: string
  marca_conjunto: string
  descricao: string
  dimensoes: string | null
  qtd_planejada: number
  peso_unitario_kg: number
  peso_total_planejado_kg: number
}

function rowToItem(row: ItemRow): ItemLista {
  return {
    id: row.id,
    frenteId: row.frente_id,
    marcaConjunto: row.marca_conjunto,
    descricao: row.descricao,
    dimensoes: row.dimensoes,
    qtdPlanejada: row.qtd_planejada,
    pesoUnitarioKg: row.peso_unitario_kg,
    pesoTotalPlanejadoKg: row.peso_total_planejado_kg,
  }
}

interface ProgressoRow extends ItemRow {
  qtd_entregue: number
  peso_entregue_kg: number
  pct_qtd_entregue: number | null
  pct_peso_entregue: number | null
  excedente: boolean
}

function rowToProgresso(row: ProgressoRow): ItemProgresso {
  return {
    ...rowToItem(row),
    qtdEntregue: row.qtd_entregue,
    pesoEntregueKg: row.peso_entregue_kg,
    pctQtdEntregue: row.pct_qtd_entregue,
    pctPesoEntregue: row.pct_peso_entregue,
    excedente: row.excedente,
  }
}

export async function listarFrentes(projetoId: string): Promise<Frente[]> {
  const { data, error } = await supabase
    .from('materiais_frentes')
    .select('id, nome, ativo')
    .eq('projeto_id', projetoId)
    .order('nome', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as FrenteRow[]).map(rowToFrente)
}

export async function criarFrente(params: { projetoId: string; organizacaoId: string; nome: string }): Promise<Frente> {
  const { data, error } = await supabase
    .from('materiais_frentes')
    .upsert(
      { projeto_id: params.projetoId, organizacao_id: params.organizacaoId, nome: params.nome },
      { onConflict: 'projeto_id,nome' }
    )
    .select('id, nome, ativo')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Falha ao criar a frente.')
  return rowToFrente(data as FrenteRow)
}

export async function listarProgresso(projetoId: string): Promise<ItemProgresso[]> {
  const { data, error } = await supabase
    .from('materiais_progresso')
    .select(
      'id:item_id, frente_id, marca_conjunto, descricao, dimensoes, qtd_planejada, peso_unitario_kg, peso_total_planejado_kg, qtd_entregue, peso_entregue_kg, pct_qtd_entregue, pct_peso_entregue, excedente'
    )
    .eq('projeto_id', projetoId)
    .order('marca_conjunto', { ascending: true })

  if (error) throw new Error(error.message)
  return (data as ProgressoRow[]).map(rowToProgresso)
}

export async function criarItem(params: {
  projetoId: string
  organizacaoId: string
  frenteId: string
  marcaConjunto: string
  descricao: string
  dimensoes: string
  qtdPlanejada: number
  pesoUnitarioKg: number
}): Promise<ItemLista> {
  const { data, error } = await supabase
    .from('materiais_listas_itens')
    .insert({
      projeto_id: params.projetoId,
      organizacao_id: params.organizacaoId,
      frente_id: params.frenteId,
      marca_conjunto: params.marcaConjunto,
      descricao: params.descricao,
      dimensoes: params.dimensoes || null,
      qtd_planejada: params.qtdPlanejada,
      peso_unitario_kg: params.pesoUnitarioKg,
    })
    .select('id, frente_id, marca_conjunto, descricao, dimensoes, qtd_planejada, peso_unitario_kg, peso_total_planejado_kg')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Falha ao criar o item.')
  return rowToItem(data as ItemRow)
}

export async function atualizarItem(
  id: string,
  params: Partial<{ frenteId: string; marcaConjunto: string; descricao: string; dimensoes: string; qtdPlanejada: number; pesoUnitarioKg: number }>
): Promise<void> {
  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (params.frenteId !== undefined) patch.frente_id = params.frenteId
  if (params.marcaConjunto !== undefined) patch.marca_conjunto = params.marcaConjunto
  if (params.descricao !== undefined) patch.descricao = params.descricao
  if (params.dimensoes !== undefined) patch.dimensoes = params.dimensoes || null
  if (params.qtdPlanejada !== undefined) patch.qtd_planejada = params.qtdPlanejada
  if (params.pesoUnitarioKg !== undefined) patch.peso_unitario_kg = params.pesoUnitarioKg

  const { error } = await supabase.from('materiais_listas_itens').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirItem(id: string): Promise<void> {
  const { error } = await supabase.from('materiais_listas_itens').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

const TAMANHO_LOTE = 500

/**
 * Grava os itens em lote via upsert contra UMA frente já resolvida — a
 * planilha real (lista de conjuntos do fornecedor/projetista) não tem coluna
 * de frente por linha, ela é sempre a lista inteira de uma única frente
 * (a "OBRA:" do cabeçalho do documento). Reimportar a mesma lista corrigida
 * atualiza os itens existentes (chave: projeto+frente+marca) em vez de
 * duplicar, graças ao onConflict.
 */
export async function importarLista(params: {
  projetoId: string
  organizacaoId: string
  frenteId: string
  linhas: LinhaImportada[]
}): Promise<{ itensGravados: number }> {
  const { projetoId, organizacaoId, frenteId, linhas } = params

  const rows = linhas.map((linha) => ({
    projeto_id: projetoId,
    organizacao_id: organizacaoId,
    frente_id: frenteId,
    marca_conjunto: linha.marcaConjunto,
    descricao: linha.descricao,
    dimensoes: linha.dimensoes || null,
    qtd_planejada: linha.qtdPlanejada,
    peso_unitario_kg: linha.pesoUnitarioKg,
  }))

  for (let i = 0; i < rows.length; i += TAMANHO_LOTE) {
    const lote = rows.slice(i, i + TAMANHO_LOTE)
    const { error } = await supabase
      .from('materiais_listas_itens')
      .upsert(lote, { onConflict: 'projeto_id,frente_id,marca_conjunto' })
    if (error) throw new Error(error.message)
  }

  return { itensGravados: rows.length }
}
