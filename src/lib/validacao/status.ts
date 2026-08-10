// Estado de validação de um lançamento, derivado das confirmações por etapa.
//
// Espelha public.validacao_status() da migration de fundação — a regra vive nos
// dois lados de propósito: o banco é quem decide de verdade (RLS + coluna
// derivada), e o client recalcula pra pintar a tela sem um round-trip por
// linha. Se mudar uma, mude a outra.

export type ValidacaoEntidade = 'apontamento' | 'carga_concreto' | 'programacao'
export type ValidacaoDecisao = 'confirmado' | 'rejeitado'
export type ValidacaoStatus = 'pendente' | 'parcial' | 'aprovado' | 'rejeitado'

export interface ValidacaoEtapa {
  id: string
  organizacao_id: string
  entidade: ValidacaoEntidade
  chave: string
  nome: string
  descricao: string | null
  ordem: number
  // true = o responsável só confirma registros das áreas atribuídas a ele
  escopo_area: boolean
  // true = só o DONO do registro confirma esta etapa, e nem precisa estar na
  // lista de responsáveis. É o que faz "cada engenheiro confirma a programação
  // dele" e não a de um colega.
  escopo_proprio: boolean
  ativo: boolean
}

export interface ValidacaoConfirmacao {
  id: string
  entidade: ValidacaoEntidade
  registro_id: string
  etapa_chave: string
  usuario_id: string
  decisao: ValidacaoDecisao
  observacao: string | null
  criado_em: string
}

export const ROTULO_STATUS: Record<ValidacaoStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
}

/**
 * Status consolidado de um registro.
 *
 * Qualquer rejeição derruba tudo — não adianta o RH ter confirmado a
 * quantidade se o Planejamento rejeitou os locais: o lançamento precisa ser
 * corrigido de qualquer jeito.
 *
 * Sem etapas ativas o registro fica `pendente`, nunca `aprovado`: uma
 * organização que ainda não configurou as etapas não deve ver tudo como
 * validado por vacuidade.
 *
 * Confirmações de etapas que não estão mais ativas são ignoradas — desativar
 * uma etapa não pode aprovar retroativamente o que dependia dela.
 */
export function computeValidacaoStatus(
  etapasAtivas: Pick<ValidacaoEtapa, 'chave'>[],
  confirmacoes: Pick<ValidacaoConfirmacao, 'etapa_chave' | 'decisao'>[],
): ValidacaoStatus {
  const chavesAtivas = new Set(etapasAtivas.map((e) => e.chave))
  const relevantes = confirmacoes.filter((c) => chavesAtivas.has(c.etapa_chave))

  if (relevantes.some((c) => c.decisao === 'rejeitado')) return 'rejeitado'
  if (chavesAtivas.size === 0) return 'pendente'

  const confirmadas = new Set(
    relevantes.filter((c) => c.decisao === 'confirmado').map((c) => c.etapa_chave),
  )
  if (confirmadas.size >= chavesAtivas.size) return 'aprovado'
  return confirmadas.size > 0 ? 'parcial' : 'pendente'
}

/** Etapas que ainda esperam decisão, na ordem configurada. */
export function etapasPendentes(
  etapasAtivas: ValidacaoEtapa[],
  confirmacoes: Pick<ValidacaoConfirmacao, 'etapa_chave'>[],
): ValidacaoEtapa[] {
  const decididas = new Set(confirmacoes.map((c) => c.etapa_chave))
  return etapasAtivas
    .filter((e) => !decididas.has(e.chave))
    .sort((a, b) => a.ordem - b.ordem)
}

/**
 * Agrupa confirmações por registro, pra tela conseguir montar a lista inteira
 * a partir de uma consulta só em vez de uma por linha.
 */
export function agruparPorRegistro<T extends Pick<ValidacaoConfirmacao, 'registro_id'>>(
  confirmacoes: T[],
): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const c of confirmacoes) {
    const atual = mapa.get(c.registro_id)
    if (atual) atual.push(c)
    else mapa.set(c.registro_id, [c])
  }
  return mapa
}
