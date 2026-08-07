import { supabase } from '../supabase'
import type { Anotacao, SiengeItem, TipoRelatorio } from './types'
import { REPORT_CONFIGS } from './report-config'

export interface Importacao {
  id: string
  tipoRelatorio: TipoRelatorio
  arquivoNome: string
  totalItens: number
  importadoEm: string
}

interface ImportacaoRow {
  id: string
  tipo_relatorio: TipoRelatorio
  arquivo_nome: string
  total_itens: number
  importado_em: string
}

function mapImportacao(row: ImportacaoRow): Importacao {
  return {
    id: row.id,
    tipoRelatorio: row.tipo_relatorio,
    arquivoNome: row.arquivo_nome,
    totalItens: row.total_itens,
    importadoEm: row.importado_em,
  }
}

interface ItemRow {
  chave: string
  insumo: string
  obra: string
  data: string
  solicitante: string
  solicitacao: string
  autorizado: boolean
  dt_aut: string
  qt_pendente: string
  unidade: string
  qt_atendida: string
  sd: string
  dt_previsao: string
  dt_atend: string
  fornecedor: string
  numero_pedido: string
  preco_unitario: string
  total_item: string
  contrato: string
  objeto: string
  empresa: string
  obras: string
  situacao: string
  saldo: string
  total: string
  importacao_id: string
}

function rowToItem(row: ItemRow): SiengeItem {
  return {
    chave: row.chave,
    insumo: row.insumo,
    obra: row.obra,
    data: row.data,
    solicitante: row.solicitante,
    solicitacao: row.solicitacao,
    autorizado: row.autorizado,
    dtAut: row.dt_aut,
    qtPendente: row.qt_pendente,
    unidade: row.unidade,
    qtAtendida: row.qt_atendida,
    sd: row.sd,
    dtPrevisao: row.dt_previsao,
    dtAtend: row.dt_atend,
    fornecedor: row.fornecedor,
    numeroPedido: row.numero_pedido,
    precoUnitario: row.preco_unitario,
    totalItem: row.total_item,
    contrato: row.contrato,
    objeto: row.objeto,
    empresa: row.empresa,
    obras: row.obras,
    situacao: row.situacao,
    saldo: row.saldo,
    total: row.total,
  }
}

function itemToRow(
  item: SiengeItem,
  ctx: { organizacaoId: string; projetoId: string; importacaoId: string; tipo: TipoRelatorio }
) {
  return {
    organizacao_id: ctx.organizacaoId,
    projeto_id: ctx.projetoId,
    importacao_id: ctx.importacaoId,
    tipo_relatorio: ctx.tipo,
    chave: item.chave,
    insumo: item.insumo,
    obra: item.obra,
    data: item.data,
    solicitante: item.solicitante,
    solicitacao: item.solicitacao,
    autorizado: item.autorizado,
    dt_aut: item.dtAut,
    qt_pendente: item.qtPendente,
    unidade: item.unidade,
    qt_atendida: item.qtAtendida,
    sd: item.sd,
    dt_previsao: item.dtPrevisao,
    dt_atend: item.dtAtend,
    fornecedor: item.fornecedor,
    numero_pedido: item.numeroPedido,
    preco_unitario: item.precoUnitario,
    total_item: item.totalItem,
    contrato: item.contrato,
    objeto: item.objeto,
    empresa: item.empresa,
    obras: item.obras,
    situacao: item.situacao,
    saldo: item.saldo,
    total: item.total,
  }
}

interface AnotacaoRow {
  chave: string
  status: string
  nota: string
  lembrete_data: string | null
  sinalizado: boolean
  atualizado_em: string
}

function rowToAnotacao(row: AnotacaoRow): Anotacao {
  return {
    status: row.status,
    nota: row.nota,
    lembreteData: row.lembrete_data,
    sinalizado: row.sinalizado,
    atualizadoEm: row.atualizado_em,
  }
}

export async function listarImportacoes(projetoId: string, tipo: TipoRelatorio): Promise<Importacao[]> {
  const { data, error } = await supabase
    .from('sienge_importacoes')
    .select('id, tipo_relatorio, arquivo_nome, total_itens, importado_em')
    .eq('projeto_id', projetoId)
    .eq('tipo_relatorio', tipo)
    .order('importado_em', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as ImportacaoRow[]).map(mapImportacao)
}

export async function excluirImportacao(importacaoId: string): Promise<void> {
  const { error } = await supabase.from('sienge_importacoes').delete().eq('id', importacaoId)
  if (error) throw new Error(error.message)
}

export async function importar(params: {
  projetoId: string
  organizacaoId: string
  userId?: string | null
  tipo: TipoRelatorio
  arquivoNome: string
  itens: SiengeItem[]
}): Promise<Importacao> {
  const { projetoId, organizacaoId, userId, tipo, arquivoNome, itens } = params

  const { data: importacaoData, error: erroImportacao } = await supabase
    .from('sienge_importacoes')
    .insert({
      projeto_id: projetoId,
      organizacao_id: organizacaoId,
      tipo_relatorio: tipo,
      arquivo_nome: arquivoNome,
      total_itens: itens.length,
      importado_por: userId ?? null,
    })
    .select('id, tipo_relatorio, arquivo_nome, total_itens, importado_em')
    .single()

  if (erroImportacao || !importacaoData) {
    throw new Error(erroImportacao?.message ?? 'Falha ao criar a importação.')
  }

  const importacaoId = (importacaoData as ImportacaoRow).id
  const TAMANHO_LOTE = 500

  try {
    for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
      const lote = itens
        .slice(i, i + TAMANHO_LOTE)
        .map((item) => itemToRow(item, { organizacaoId, projetoId, importacaoId, tipo }))
      const resposta = (await supabase.from('sienge_itens').insert(lote).select('id')) as {
        data: { id: string }[] | null
        error: { message: string } | null
      }
      if (resposta.error) throw new Error(resposta.error.message)
      if (!resposta.data || resposta.data.length !== lote.length) {
        throw new Error(`Falha ao gravar a importação: esperava ${lote.length} itens, mas só ${resposta.data?.length ?? 0} foram registrados.`)
      }
    }
  } catch (erro) {
    // Importação parcial não fica órfã: apaga a importação (cascade remove os
    // itens já inseridos) e relança o erro original pro chamador avisar o usuário.
    await supabase.from('sienge_importacoes').delete().eq('id', importacaoId)
    throw erro
  }

  return mapImportacao(importacaoData as ImportacaoRow)
}

const TAMANHO_PAGINA_ITENS = 1000
const COLUNAS_ITEM = 'chave, insumo, obra, data, solicitante, solicitacao, autorizado, dt_aut, qt_pendente, unidade, qt_atendida, sd, dt_previsao, dt_atend, fornecedor, numero_pedido, preco_unitario, total_item, contrato, objeto, empresa, obras, situacao, saldo, total, importacao_id'

async function buscarTodosOsItens(projetoId: string, tipo: TipoRelatorio, importacaoId?: string): Promise<ItemRow[]> {
  const linhas: ItemRow[] = []
  let de = 0
  for (;;) {
    let query = supabase
      .from('sienge_itens')
      .select(COLUNAS_ITEM)
      .eq('projeto_id', projetoId)
      .eq('tipo_relatorio', tipo)
      .order('criado_em', { ascending: true })
    if (importacaoId) query = query.eq('importacao_id', importacaoId)
    const { data, error } = await query.range(de, de + TAMANHO_PAGINA_ITENS - 1)
    if (error) throw new Error(error.message)
    const pagina = data as ItemRow[]
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA_ITENS) break
    de += TAMANHO_PAGINA_ITENS
  }
  return linhas
}

/**
 * "Visão atual" de um tipo de relatório: pra tipos em modo "substituir"
 * (Solicitações), só os itens da importação mais recente; pra modo
 * "acumular" (Pedidos, Contratos), junta itens de todas as importações
 * mantendo por `chave` apenas a versão mais recente.
 */
export async function itensAtuais(projetoId: string, tipo: TipoRelatorio): Promise<SiengeItem[]> {
  const modo = REPORT_CONFIGS[tipo].modo
  const importacoes = await listarImportacoes(projetoId, tipo)
  if (importacoes.length === 0) return []

  if (modo === 'substituir') {
    const maisRecente = importacoes[0]!
    const linhas = await buscarTodosOsItens(projetoId, tipo, maisRecente.id)
    return linhas.map(rowToItem)
  }

  const importadoEmPorId = new Map(importacoes.map((imp) => [imp.id, imp.importadoEm]))

  const linhas = await buscarTodosOsItens(projetoId, tipo)

  const ordenadas = [...linhas].sort((a, b) => {
    const da = importadoEmPorId.get(a.importacao_id) ?? ''
    const dbEm = importadoEmPorId.get(b.importacao_id) ?? ''
    return da.localeCompare(dbEm)
  })

  const porChave = new Map<string, SiengeItem>()
  for (const linha of ordenadas) {
    porChave.set(linha.chave, rowToItem(linha))
  }
  return [...porChave.values()]
}

export async function listarAnotacoes(projetoId: string, tipo: TipoRelatorio): Promise<Map<string, Anotacao>> {
  const { data, error } = await supabase
    .from('sienge_anotacoes')
    .select('chave, status, nota, lembrete_data, sinalizado, atualizado_em')
    .eq('projeto_id', projetoId)
    .eq('tipo_relatorio', tipo)

  if (error) throw new Error(error.message)

  const mapa = new Map<string, Anotacao>()
  for (const row of data as AnotacaoRow[]) {
    mapa.set(row.chave, rowToAnotacao(row))
  }
  return mapa
}

export async function salvarAnotacao(params: {
  projetoId: string
  organizacaoId: string
  userId?: string | null
  tipo: TipoRelatorio
  chave: string
  anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>
}): Promise<void> {
  const { projetoId, organizacaoId, userId, tipo, chave, anotacao } = params

  const { error } = await supabase.from('sienge_anotacoes').upsert(
    {
      projeto_id: projetoId,
      organizacao_id: organizacaoId,
      tipo_relatorio: tipo,
      chave,
      status: anotacao.status,
      nota: anotacao.nota,
      lembrete_data: anotacao.lembreteData,
      sinalizado: anotacao.sinalizado,
      atualizado_por: userId ?? null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'projeto_id,tipo_relatorio,chave' }
  )

  if (error) throw new Error(error.message)
}
