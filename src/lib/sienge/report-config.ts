import type { Classificacao, ItemComClassificacao, SiengeItem, TipoRelatorio } from './types'
import { DIAS_LIMITE_ATRASO } from './classify'
import { formatarMoeda, parseMoeda } from './money'

export type FiltroColuna =
  | { kind: 'texto' }
  | { kind: 'dropdown' }
  | { kind: 'data' }
  | { kind: 'chips'; opcoes: string[] }
  | { kind: 'dias-faixa' }

export interface ColunaConfig {
  key: keyof SiengeItem | 'dias'
  label: string
  filtro?: FiltroColuna
  moeda?: boolean
  comUnidade?: boolean
}

export interface StatCard {
  label: string
  classe: Classificacao
  valor: (itens: ItemComClassificacao[]) => string
}

export interface ReportConfig {
  tipo: TipoRelatorio
  titulo: string
  nomeItens: string
  modo: 'substituir' | 'acumular'
  colunas: ColunaConfig[]
  colunasDetalhe: ColunaConfig[]
  stats: StatCard[]
}

const emAberto = (itens: ItemComClassificacao[]) => itens.filter((i) => i.classificacao.classe !== 'good')
const criticos = (itens: ItemComClassificacao[]) =>
  itens.filter((i) => i.classificacao.dias >= 30 && i.classificacao.classe !== 'good')
const somaMoeda = (itens: ItemComClassificacao[], campo: 'total' | 'saldo') =>
  formatarMoeda(itens.reduce((soma, i) => soma + parseMoeda(i[campo]), 0))

export const REPORT_CONFIGS: Record<TipoRelatorio, ReportConfig> = {
  solicitacoes: {
    tipo: 'solicitacoes',
    titulo: 'Relação de Solicitações',
    nomeItens: 'solicitações',
    modo: 'substituir',
    colunas: [
      { key: 'dias', label: 'Dias', filtro: { kind: 'dias-faixa' } },
      { key: 'insumo', label: 'Insumo', filtro: { kind: 'texto' } },
      { key: 'obra', label: 'Obra', filtro: { kind: 'dropdown' } },
      { key: 'solicitante', label: 'Solicitante', filtro: { kind: 'texto' } },
      { key: 'solicitacao', label: 'Nº Solicitação', filtro: { kind: 'texto' } },
      { key: 'data', label: 'Data', filtro: { kind: 'data' } },
      { key: 'dtPrevisao', label: 'Previsão', filtro: { kind: 'data' } },
      { key: 'qtPendente', label: 'Qtd. Pendente', comUnidade: true },
      { key: 'autorizado', label: 'Autorizado', filtro: { kind: 'chips', opcoes: ['Sim', 'Não'] } },
    ],
    colunasDetalhe: [
      { key: 'qtAtendida', label: 'Qtd. Atendida', comUnidade: true },
      { key: 'sd', label: 'Satisfeito' },
      { key: 'dtAut', label: 'Data de Autorização' },
      { key: 'dtAtend', label: 'Data de Atendimento' },
    ],
    stats: [
      { label: 'Solicitações pendentes', classe: 'good', valor: (itens) => String(itens.length) },
      {
        label: `Atrasadas (mais de ${DIAS_LIMITE_ATRASO} dias)`,
        classe: 'warning',
        valor: (itens) => String(itens.filter((i) => i.classificacao.dias > DIAS_LIMITE_ATRASO).length),
      },
      {
        label: 'Críticas (30+ dias)',
        classe: 'critical',
        valor: (itens) => String(itens.filter((i) => i.classificacao.dias >= 30).length),
      },
      {
        label: 'Ainda não autorizadas',
        classe: 'serious',
        valor: (itens) => String(itens.filter((i) => !i.autorizado).length),
      },
    ],
  },

  pedidos: {
    tipo: 'pedidos',
    titulo: 'Pedido de Compra',
    nomeItens: 'pedidos de compra',
    modo: 'acumular',
    colunas: [
      { key: 'dias', label: 'Dias', filtro: { kind: 'dias-faixa' } },
      { key: 'numeroPedido', label: 'Nº Pedido', filtro: { kind: 'texto' } },
      { key: 'fornecedor', label: 'Fornecedor', filtro: { kind: 'texto' } },
      { key: 'obra', label: 'Obra', filtro: { kind: 'dropdown' } },
      { key: 'data', label: 'Data do Pedido', filtro: { kind: 'data' } },
      { key: 'solicitante', label: 'Comprador', filtro: { kind: 'texto' } },
      {
        key: 'sd',
        label: 'Situação',
        filtro: { kind: 'chips', opcoes: ['Pendente', 'Parcialmente entregue', 'Totalmente entregue', 'Cancelado'] },
      },
      { key: 'total', label: 'Total', moeda: true },
    ],
    colunasDetalhe: [
      { key: 'insumo', label: 'Insumo' },
      { key: 'precoUnitario', label: 'Preço Unitário', moeda: true },
    ],
    stats: [
      { label: 'Pedidos em aberto', classe: 'warning', valor: (itens) => String(emAberto(itens).length) },
      { label: 'Críticos (30+ dias)', classe: 'critical', valor: (itens) => String(criticos(itens).length) },
      { label: 'Valor em aberto', classe: 'critical', valor: (itens) => somaMoeda(emAberto(itens), 'total') },
      { label: 'Valor total', classe: 'good', valor: (itens) => somaMoeda(itens, 'total') },
    ],
  },

  contratos: {
    tipo: 'contratos',
    titulo: 'Relação de Contratos',
    nomeItens: 'contratos',
    modo: 'acumular',
    colunas: [
      { key: 'dias', label: 'Dias', filtro: { kind: 'dias-faixa' } },
      { key: 'contrato', label: 'Nº Contrato', filtro: { kind: 'texto' } },
      { key: 'fornecedor', label: 'Fornecedor', filtro: { kind: 'texto' } },
      { key: 'objeto', label: 'Objeto', filtro: { kind: 'texto' } },
      { key: 'empresa', label: 'Empresa', filtro: { kind: 'dropdown' } },
      { key: 'obras', label: 'Obras', filtro: { kind: 'dropdown' } },
      { key: 'data', label: 'Data', filtro: { kind: 'data' } },
      {
        key: 'situacao',
        label: 'Situação',
        filtro: {
          kind: 'chips',
          opcoes: ['Pendente', 'Parcialmente medido', 'Totalmente medido', 'Concluído', 'Rescindido'],
        },
      },
      { key: 'total', label: 'Total', moeda: true },
      { key: 'saldo', label: 'Saldo', moeda: true },
    ],
    colunasDetalhe: [],
    stats: [
      { label: 'Contratos em aberto', classe: 'warning', valor: (itens) => String(emAberto(itens).length) },
      { label: 'Críticos (30+ dias)', classe: 'critical', valor: (itens) => String(criticos(itens).length) },
      { label: 'Valor em aberto', classe: 'critical', valor: (itens) => somaMoeda(emAberto(itens), 'total') },
      { label: 'Valor total', classe: 'good', valor: (itens) => somaMoeda(itens, 'total') },
    ],
  },
}
