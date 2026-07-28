export type TipoRelatorio = 'solicitacoes' | 'pedidos' | 'contratos'

export interface SiengeItem {
  chave: string
  insumo: string
  obra: string
  data: string
  solicitante: string
  solicitacao: string
  autorizado: boolean
  dtAut: string
  qtPendente: string
  unidade: string
  qtAtendida: string
  sd: string
  dtPrevisao: string
  dtAtend: string
  fornecedor: string
  numeroPedido: string
  precoUnitario: string
  totalItem: string
  contrato: string
  objeto: string
  empresa: string
  obras: string
  situacao: string
  saldo: string
  total: string
}

export const ITEM_VAZIO: Omit<SiengeItem, 'chave'> = {
  insumo: '', obra: '', data: '', solicitante: '', solicitacao: '',
  autorizado: true, dtAut: '', qtPendente: '', unidade: '', qtAtendida: '', sd: '',
  dtPrevisao: '', dtAtend: '', fornecedor: '', numeroPedido: '', precoUnitario: '',
  totalItem: '', contrato: '', objeto: '', empresa: '', obras: '', situacao: '',
  saldo: '', total: '',
}

export type Classificacao = 'good' | 'warning' | 'serious' | 'critical'

export interface ClassificacaoResultado {
  classe: Classificacao
  label: string
  dias: number
}

export interface Anotacao {
  status: string
  nota: string
  lembreteData: string | null
  sinalizado: boolean
  atualizadoEm: string
}

export const ANOTACAO_PADRAO: Anotacao = {
  status: 'pendente',
  nota: '',
  lembreteData: null,
  sinalizado: false,
  atualizadoEm: '',
}

export interface ItemComClassificacao extends SiengeItem {
  classificacao: ClassificacaoResultado
  anotacao: Anotacao
}

export const TITULOS_TIPO: Record<TipoRelatorio, string> = {
  solicitacoes: 'Relação de Solicitações',
  pedidos: 'Pedido de Compra',
  contratos: 'Relação de Contratos',
}
