// Sincronização das horas-homem apontadas para a EAP antiga (cronograma_itens).
//
// Extraído da tela de Validação quando ela virou registro-a-registro: a conta
// não muda, mas agora roda depois de cada decisão de validação em vez de dentro
// do botão "Confirmar validação" que marcava o dia inteiro.
//
// Só apontamentos APROVADOS entram na conta — `validado` é mantido em sincronia
// com validacao_status='aprovado' pelo trigger de propagação
// (20260810020000_validacao-apontamento-migration.sql).

import { supabase } from '@/lib/supabase'

/** Fallback pra apontamentos validados antes de a jornada do dia existir. */
export const HORAS_DIA_PADRAO = 8

export interface ApontamentoValidado {
  atividade_id: string | null
  atividade_nome: string
  total: number
  data: string
}

export interface CronogramaItem {
  id: string
  nome: string
  atividade_id: string | null
  pai_id: string | null
  ativo?: boolean | null
}

export interface HorasAgregadas {
  porAtivId: Map<string, number>
  porNome: Map<string, number>
}

/**
 * Converte contagem de pessoas em horas-homem (pessoas × jornada do dia) e
 * agrega por atividade.
 *
 * Agrega nas duas chaves de propósito: itens de cronograma importados de XML
 * costumam não ter `atividade_id`, e aí o casamento é pelo nome.
 */
export function agregarHorasHomem(
  validados: ApontamentoValidado[],
  horasPorData: Map<string, number>,
): HorasAgregadas {
  const porAtivId = new Map<string, number>()
  const porNome = new Map<string, number>()

  for (const a of validados) {
    const horasHomem = a.total * (horasPorData.get(a.data) ?? HORAS_DIA_PADRAO)
    if (a.atividade_id) {
      porAtivId.set(a.atividade_id, (porAtivId.get(a.atividade_id) ?? 0) + horasHomem)
    }
    porNome.set(a.atividade_nome, (porNome.get(a.atividade_nome) ?? 0) + horasHomem)
  }

  return { porAtivId, porNome }
}

/**
 * Horas-homem de cada item da árvore de EAP: folha recebe o que foi apontado
 * nela; pai recebe a soma dos filhos.
 */
export function calcularHhPorItem(
  itens: CronogramaItem[],
  { porAtivId, porNome }: HorasAgregadas,
): Map<string, number> {
  const ativos = itens.filter((i) => i.ativo !== false)

  const filhosByPai = new Map<string, CronogramaItem[]>()
  for (const item of ativos) {
    if (!item.pai_id) continue
    const lista = filhosByPai.get(item.pai_id)
    if (lista) lista.push(item)
    else filhosByPai.set(item.pai_id, [item])
  }

  const hh = new Map<string, number>()
  // pai_id corrompido (ciclo) travaria a recursão — `visitando` corta o ciclo
  // em vez de estourar a pilha.
  const visitando = new Set<string>()

  function calc(item: CronogramaItem): number {
    if (hh.has(item.id)) return hh.get(item.id)!
    if (visitando.has(item.id)) return 0
    visitando.add(item.id)

    const filhos = filhosByPai.get(item.id) ?? []
    let horas: number
    if (filhos.length === 0) {
      horas = item.atividade_id
        ? (porAtivId.get(item.atividade_id) ?? 0)
        : (porNome.get(item.nome) ?? 0)
    } else {
      horas = filhos.reduce((soma, filho) => soma + calc(filho), 0)
    }

    visitando.delete(item.id)
    hh.set(item.id, horas)
    return horas
  }

  for (const raiz of ativos.filter((i) => !i.pai_id)) calc(raiz)
  return hh
}

/**
 * Recalcula e grava `cronograma_itens.hh_consumido` a partir de tudo que está
 * aprovado hoje. Silenciosa se a tabela não existir.
 *
 * @returns quantos itens foram atualizados, ou null se a EAP antiga não existe.
 */
export async function sincronizarHorasHomem(organizacaoId: string, projetoId: string): Promise<number | null> {
  const { data: validados, error: erroValidados } = await supabase
    .from('apontamentos_diarios')
    .select('atividade_id,atividade_nome,total,data')
    .eq('organizacao_id', organizacaoId)
    .eq('projeto_id', projetoId)
    .eq('validado', true)
  if (erroValidados) throw erroValidados

  const { data: dias } = await supabase
    .from('dias_trabalho')
    .select('data,horas_dia')
    .eq('organizacao_id', organizacaoId)
    .eq('projeto_id', projetoId)
  const horasPorData = new Map<string, number>(
    (dias ?? []).map((d: { data: string; horas_dia: number }) => [d.data, d.horas_dia]),
  )

  // cronograma_itens é do fluxo antigo de EAP por importação de XML — quem não
  // usa mais esse fluxo pode nem ter a tabela. A EAP atual (eap_modelos) calcula
  // HH direto de apontamentos_diarios, então sem a tabela só pulamos a
  // sincronização em vez de falhar a validação inteira.
  const { data: itens, error: erroItens } = await supabase
    .from('cronograma_itens')
    .select('id,nome,atividade_id,pai_id,ativo')
  if (erroItens) {
    if (erroItens.code === 'PGRST205') return null
    throw erroItens
  }
  if (!itens) return null

  const hh = calcularHhPorItem(
    itens as CronogramaItem[],
    agregarHorasHomem((validados ?? []) as ApontamentoValidado[], horasPorData),
  )

  for (const [id, valor] of hh) {
    const { error } = await supabase
      .from('cronograma_itens')
      .update({ hh_consumido: valor })
      .eq('id', id)
    if (error) throw error
  }

  return hh.size
}
