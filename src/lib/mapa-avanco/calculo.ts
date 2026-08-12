// Cálculo de avanço de uma grade (mapa sobre planta).
//
// Duas métricas convivem, de propósito:
//
// 1. ESCADA ACUMULATIVA (`ordem`) — reproduz a legenda que hoje é feita à mão no
//    AutoCAD: "76% lançado / 41% liberado". Tudo que está curado também foi
//    concretado, então cada etapa conta as células que chegaram NAQUELA etapA ou
//    além. Ordem 0 é o estado inicial e não vira indicador.
//
// 2. PONDERADO (`peso`) — um número único por grade, usado no consolidado de
//    grupo e na futura ligação com a Curva S.
//
// Em ambas, `conta_no_calculo = false` (a praça hachurada que não recebe piso)
// sai do denominador.

export interface MapaStatus {
  id: string
  chave: string
  label: string
  cor_hex: string
  peso: number
  conta_no_calculo: boolean
  ordem: number
}

export interface MapaCelula {
  /** Qual fileira/trecho da malha. */
  segmento_id: string
  linha: number
  coluna: number
  status_id: string
}

/** Um trecho da malha. Uma grade pode ter vários (ex.: as 4 faces do perímetro). */
export interface SegmentoDimensoes {
  id: string
  colunas: number
  linhas: number
}

export interface DimensoesGrade {
  /** Todos os trechos que compõem a grade. O total é a soma deles. */
  segmentos: SegmentoDimensoes[]
  /**
   * O que a grade inteira representa no mundo real (ex.: 150 m² de telhado).
   * A malha é uma escolha de desenho; isto é a medida. Opcional.
   */
  quantidadeTotal?: number | null
  unidade?: string | null
}

export interface EtapaAvanco {
  ordem: number
  label: string
  cor_hex: string
  concluidas: number
  total: number
  pct: number
  /** pct aplicado sobre quantidadeTotal. null quando a grade não tem medida. */
  quantidade: number | null
}

export interface AvancoGrade {
  /** Células da grade inteira (colunas × linhas), incluindo as desativadas. */
  totalCelulas: number
  /** Denominador real: exclui os status marcados como fora do cálculo. */
  totalAtivo: number
  /** Quantas células estão num status fora do cálculo. */
  desativadas: number
  /** Um item por status com ordem >= 1, do mais inicial ao mais avançado. */
  etapas: EtapaAvanco[]
  /** Percentual único ponderado por `peso`. Base do consolidado de grupo. */
  pctPonderado: number
  /** A medida informada para a grade, repassada para quem exibe. */
  quantidadeTotal: number | null
  unidade: string | null
  /** pctPonderado convertido na unidade da grade. */
  quantidadePonderada: number | null
}

/**
 * O status que vale para uma célula nunca clicada.
 *
 * Normalmente é o de `ordem` 0, mas um catálogo mal configurado pode não ter
 * nenhum — nesse caso cai no de menor ordem, em vez de quebrar a tela.
 */
export function statusInicial(status: MapaStatus[]): MapaStatus | null {
  if (status.length === 0) return null
  return [...status].sort((a, b) => a.ordem - b.ordem)[0]
}

/**
 * Quantas células estão em cada status, incluindo as que nunca foram clicadas
 * (que entram no status inicial).
 *
 * Células fora dos limites da grade são ignoradas: reduzir o número de colunas
 * de uma grade já apontada não deve fazer o total estourar.
 */
export function contarPorStatus(
  dimensoes: DimensoesGrade,
  status: MapaStatus[],
  celulas: MapaCelula[],
): Map<string, number> {
  const contagem = new Map<string, number>()
  for (const s of status) contagem.set(s.id, 0)

  const idsValidos = new Set(status.map((s) => s.id))
  const porSegmento = new Map(dimensoes.segmentos.map((s) => [s.id, s]))
  let marcadas = 0

  for (const c of celulas) {
    // Célula de um segmento que não existe mais (fileira excluída) é ignorada,
    // e o mesmo vale pra célula fora dos limites do segmento dela — reduzir as
    // colunas de uma fileira já apontada não pode fazer o total estourar.
    const seg = porSegmento.get(c.segmento_id)
    if (!seg) continue
    if (c.linha < 0 || c.linha >= seg.linhas) continue
    if (c.coluna < 0 || c.coluna >= seg.colunas) continue
    if (!idsValidos.has(c.status_id)) continue
    contagem.set(c.status_id, (contagem.get(c.status_id) ?? 0) + 1)
    marcadas++
  }

  const inicial = statusInicial(status)
  if (inicial) {
    const total = totalDeCelulas(dimensoes)
    contagem.set(inicial.id, (contagem.get(inicial.id) ?? 0) + Math.max(0, total - marcadas))
  }

  return contagem
}

/** Soma das células de todos os segmentos da grade. */
export function totalDeCelulas(dimensoes: DimensoesGrade): number {
  return dimensoes.segmentos.reduce((soma, s) => soma + s.colunas * s.linhas, 0)
}

/** Avanço completo de uma grade: escada por etapa + ponderado. */
export function calcularAvanco(
  dimensoes: DimensoesGrade,
  status: MapaStatus[],
  celulas: MapaCelula[],
): AvancoGrade {
  const totalCelulas = totalDeCelulas(dimensoes)
  const contagem = contarPorStatus(dimensoes, status, celulas)

  let desativadas = 0
  for (const s of status) {
    if (!s.conta_no_calculo) desativadas += contagem.get(s.id) ?? 0
  }
  const totalAtivo = totalCelulas - desativadas

  // Uma etapa por status com ordem >= 1. Ordens repetidas viram uma etapa só —
  // a primeira do catálogo —, senão o mesmo percentual apareceria duas vezes.
  const etapasBase = status
    .filter((s) => s.ordem >= 1 && s.conta_no_calculo)
    .sort((a, b) => a.ordem - b.ordem)
    .filter((s, i, arr) => i === 0 || arr[i - 1].ordem !== s.ordem)

  // A medida informada vale para as células que CONTAM: se 10 de 100 praças
  // não recebem piso, os 150 m² são das 90 restantes.
  const quantidadeTotal = dimensoes.quantidadeTotal ?? null
  const unidade = dimensoes.unidade ?? null
  const emQuantidade = (pct: number) => (quantidadeTotal === null ? null : (pct / 100) * quantidadeTotal)

  const etapas: EtapaAvanco[] = etapasBase.map((etapa) => {
    let concluidas = 0
    for (const s of status) {
      if (s.conta_no_calculo && s.ordem >= etapa.ordem) {
        concluidas += contagem.get(s.id) ?? 0
      }
    }
    const pct = totalAtivo > 0 ? (concluidas / totalAtivo) * 100 : 0
    return {
      ordem: etapa.ordem,
      label: etapa.label,
      cor_hex: etapa.cor_hex,
      concluidas,
      total: totalAtivo,
      pct,
      quantidade: emQuantidade(pct),
    }
  })

  let somaPesos = 0
  for (const s of status) {
    if (s.conta_no_calculo) somaPesos += (contagem.get(s.id) ?? 0) * s.peso
  }
  const pctPonderado = totalAtivo > 0 ? (somaPesos / totalAtivo) * 100 : 0

  return {
    totalCelulas,
    totalAtivo,
    desativadas,
    etapas,
    pctPonderado,
    quantidadeTotal,
    unidade,
    quantidadePonderada: emQuantidade(pctPonderado),
  }
}

/**
 * Consolidado de um grupo: média PONDERADA pelo número de células ativas.
 *
 * Média simples distorceria — uma grade de 40 células pesaria o mesmo que uma de
 * 600 e poderia mascarar o atraso da grande.
 */
export interface AvancoGrupo {
  pctPonderado: number
  totalAtivo: number
  /** Só existe quando TODAS as grades do grupo medem na mesma unidade. */
  quantidadeTotal: number | null
  quantidadeConcluida: number | null
  unidade: string | null
}

export function calcularAvancoGrupo(avancos: AvancoGrade[]): AvancoGrupo {
  const totalAtivo = avancos.reduce((soma, a) => soma + a.totalAtivo, 0)
  const vazio: AvancoGrupo = {
    pctPonderado: 0,
    totalAtivo: 0,
    quantidadeTotal: null,
    quantidadeConcluida: null,
    unidade: null,
  }
  if (totalAtivo === 0) return vazio

  const somaPonderada = avancos.reduce((soma, a) => soma + a.pctPonderado * a.totalAtivo, 0)
  const pctPonderado = somaPonderada / totalAtivo

  // Somar m² com unidades diferentes daria um número sem significado — nesse
  // caso o grupo mostra só o percentual. Idem se alguma grade não tem medida:
  // o total seria parcial e enganoso.
  const unidades = new Set(avancos.map((a) => a.unidade?.trim() || null))
  const todasMedidas = avancos.every((a) => a.quantidadeTotal !== null)
  const unidadeUnica = unidades.size === 1 ? [...unidades][0] : null

  if (!todasMedidas || !unidadeUnica) {
    return { pctPonderado, totalAtivo, quantidadeTotal: null, quantidadeConcluida: null, unidade: null }
  }

  const quantidadeTotal = avancos.reduce((soma, a) => soma + (a.quantidadeTotal ?? 0), 0)
  const quantidadeConcluida = avancos.reduce((soma, a) => soma + (a.quantidadePonderada ?? 0), 0)
  return { pctPonderado, totalAtivo, quantidadeTotal, quantidadeConcluida, unidade: unidadeUnica }
}

/** "45,3 m²" — pt-BR, no máximo uma casa e sem decimal quando redondo. */
export function formatarQuantidade(valor: number | null, unidade: string | null): string | null {
  if (valor === null || !unidade) return null
  const texto = valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${texto} ${unidade}`
}

export interface Ponto {
  x: number
  y: number
}

export interface Calibracao {
  offset_x: number
  offset_y: number
  passo_x: number
  passo_y: number
}

/**
 * Deriva a calibração a partir do CENTRO do primeiro e do último elemento.
 *
 * Acertar seis números no olho é o que torna a calibração penosa. Clicar em
 * dois pontos que a pessoa enxerga na planta — a primeira estaca e a última —
 * resolve quatro deles de uma vez.
 *
 * O passo sai da distância dividida por (n - 1), e não por n, porque entre 10
 * elementos existem 9 vãos. O offset recua meio elemento porque o clique marca
 * o centro, enquanto a malha é desenhada a partir do canto.
 *
 * Uma única coluna (ou linha) não define passo nenhum — nesse caso mantém o
 * passo atual em vez de dividir por zero.
 */
export function calibrarPorExtremos(
  primeiro: Ponto,
  ultimo: Ponto,
  colunas: number,
  linhas: number,
  tamanho: { largura: number; altura: number },
  passoAtual: { x: number; y: number },
): Calibracao {
  const passo_x = colunas > 1 ? Math.abs(ultimo.x - primeiro.x) / (colunas - 1) : passoAtual.x
  const passo_y = linhas > 1 ? Math.abs(ultimo.y - primeiro.y) / (linhas - 1) : passoAtual.y

  // Math.min: se a pessoa clicar do fim para o começo, ainda funciona.
  return {
    offset_x: Math.min(primeiro.x, ultimo.x) - tamanho.largura / 2,
    offset_y: Math.min(primeiro.y, ultimo.y) - tamanho.altura / 2,
    passo_x,
    passo_y,
  }
}

/**
 * Chave de uma célula nos mapas de estado em memória.
 *
 * Inclui o segmento porque linha 0 / coluna 0 existe em CADA fileira — sem ele,
 * a primeira estaca do topo e a da base seriam a mesma chave.
 */
export function chaveCelula(segmentoId: string, linha: number, coluna: number): string {
  return `${segmentoId}_${linha}_${coluna}`
}

/** "29%" — sem casa decimal quando redonda, uma casa quando não. */
export function formatarPct(pct: number): string {
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`
}
