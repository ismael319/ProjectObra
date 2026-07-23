// Parser de XML exportado do MS Project
// Suporta formato MSPDI (Microsoft Project Data Interchange)
// Extração de TimephasedData para Curva S

/**
 * Decodifica os bytes de um arquivo XML detectando o encoding pelo BOM (Byte Order
 * Mark). Exports do MS Project frequentemente vêm em UTF-16 (com BOM), não UTF-8 —
 * ler sempre como UTF-8 corrompe os primeiros bytes e o DOMParser rejeita o XML como
 * inválido ("Start tag expected, '<' not found"), mesmo o arquivo sendo válido.
 */
export function decodeXmlBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer)
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer)
  }
  // UTF-8 (com ou sem BOM) — TextDecoder remove o BOM automaticamente por padrão.
  return new TextDecoder('utf-8').decode(buffer)
}

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

export interface BaselineData {
  work: number   // minutos (para HH)
  cost: number   // R$ (para custo)
  start?: Date   // início da linha de base (elemento <Baseline> aninhado do Task)
  finish?: Date  // término da linha de base (idem)
}

export interface BaselineInfo {
  id: string           // "BL0", "BL1", ... "BL10"
  index: number        // 0-10
  label: string        // "Baseline 0 (original)", "Baseline 1 (revisão 1)", ...
  available: boolean   // tem dados no XML
  totalWork: number    // soma do work de todas atividades
  totalCost: number    // soma do cost de todas atividades
  savedDate?: Date     // data em que a linha base foi salva no MS Project
  hasTimephased: boolean // possui dados de trabalho distribuídos no tempo (Type 4)
}

export interface WBSActivity {
  id: string
  uid: number
  name: string
  wbs: string
  outlineLevel: number
  outlineNumber: string
  start: Date
  finish: Date
  duration: number // em minutos
  durationFormat: number
  percentComplete: number
  actualStart?: Date
  actualFinish?: Date
  actualDuration?: number
  remainingDuration?: number
  predecessorUids: number[]
  resourceUids: number[]
  isMilestone: boolean
  isSummary: boolean
  baselineStart?: Date
  baselineFinish?: Date
  baselineDuration?: number
  cost?: number
  actualCost?: number
  // Dados de trabalho (work) em minutos
  work?: number
  actualWork?: number
  // Baselines BL0-BL10: work (minutos) e cost (R$)
  baselines: BaselineData[] // índice 0=BL0, 1=BL1, ... 10=BL10
  // Novos campos
  responsible: string
  discipline: string
  area: string
  notes: string
  priority: number
  calendarName: string
  text1: string
  text2: string
  text3: string
  number1: number
  number2: number
  // Campos personalizados (Extended Attributes) do MS Project, chaveados por
  // FieldID — nomes legíveis ficam em ParsedProject.customFieldDefs. Opcional:
  // dados de exemplo (sample-data.ts) e outras fontes sintéticas não preenchem;
  // consumidores devem acessar com "?." (ver getActivityColumnValue).
  customFields?: Record<string, string>
}

export interface WBSResource {
  uid: number
  name: string
  type: number // 1=Trabalho, 2=Material, 3=Custo
  initials: string
  group: string
  maxUnits: number
  peakUnits: number
  baseRate: number
  costPerUse: number
  // Novos campos
  role: string // Função/Cargo
  email: string
  phone: string
  code: string // Código do recurso
}

export interface WBSAssignment {
  uid: number
  taskUid: number
  resourceUid: number
  units: number
  work: number // em minutos
  actualWork: number
  cost: number
  actualCost: number
  // Novos campos
  delay: number // Atraso em minutos
  levelingDelay: number
}

// ═══════════════════════════════════════════════════════════════════
// TIMEPHASED DATA - Tipos e interfaces
// ═══════════════════════════════════════════════════════════════════

/**
 * Tipo de dado timephased conforme MS Project:
 *  Type 1 = Trabalho Planejado (Work) — pouco confiável: omitido em exports para
 *           tarefas já concluídas, não deve ser usado como fonte de Planejado (PV)
 *  Type 2 = Trabalho Real (Actual Work)
 *  Type 4 = Baseline 0 Work
 *  Type 9 = Trabalho Acumulado (não usado diretamente)
 *  Type 10, 11 = Unidades/Percentual (não usados diretamente)
 *  Type 16 = Baseline 1 Work — confirmado empiricamente (bate exato com o total
 *           declarado em <Baseline><Number>1</Number><Work>); pode não generalizar
 *           para outras versões/exports do MS Project
 *  Type 18, 19 = variantes acumuladas (não usados diretamente)
 *  Type 22 = Custo Acumulado
 *  Type 24 = Dados de Série Temporal
 */
export type TimephasedDataType = 1 | 2 | 4 | 5 | 9 | 10 | 11 | 16 | 18 | 19 | 22 | 24

export interface TimephasedDataPoint {
  type: TimephasedDataType
  uid: number           // UID do assignment
  start: Date           // início do período
  finish: Date          // fim do período
  unit: number          // unidade (1.0 = 100%)
  valueHours: number    // valor convertido para horas decimais
  baselineIndex?: number // para Type 4: índice do baseline (0-10)
}

export interface TimephasedWeek {
  weekStart: Date       // segunda-feira da semana
  weekLabel: string     // "2025-W51" ou "dez/2025"
  periodKey: string     // chave única para agrupamento
  planned: number       // HH (type 1)
  actual: number        // HH (type 2)
  baselines: Record<number, number> // BL0-BL10 → HH
  costPlanned: number   // R$ (type 22)
}

export interface TimephasedSeries {
  /** Granularidade dos dados: 'day', 'week', 'month' */
  granularity: 'day' | 'week' | 'month'
  /** Dados brutos extraídos do XML */
  rawPoints: TimephasedDataPoint[]
  /** Dados agregados por período (semana) */
  weeks: TimephasedWeek[]
  /** Totais para validação */
  totals: {
    plannedHours: number
    actualHours: number
    baselineHours: Record<number, number>
  }
  /** Período coberto */
  dateRange: {
    start: Date
    end: Date
  }
  /** true se os dados foram extraídos com sucesso do XML */
  available: boolean
  /** Índices de baseline que possuem dados timephased (ex: {0, 1, 3}) */
  baselineIndices: Set<number>
}

export interface ParsedProject {
  name: string
  startDate: Date
  finishDate: Date
  author: string
  company: string
  description: string
  activities: WBSActivity[]
  resources: WBSResource[]
  assignments: WBSAssignment[]
  baselines: BaselineInfo[]  // BL0-BL10 com status de disponibilidade
  /** Dados timephased extraídos dos assignments (Curva S real) */
  timephased: TimephasedSeries
  /**
   * Dia em que a semana começa, conforme configurado no MS Project
   * (Arquivo > Opções > Cronograma > "A semana começa no(a)"), extraído de
   * <WeekStartDay> do XML. Mesma convenção do Date.getDay(): 0=domingo,
   * 1=segunda, ..., 5=sexta, 6=sábado. Ausente no XML → assume sexta (5).
   */
  weekStartDay: number
  /**
   * Minutos de trabalho por dia, extraído de <MinutesPerDay> do XML.
   * Padrão MS Project = 540 (9 horas). Usado para converter durações ISO 8601
   * que incluem componente "D" (dias).
   */
  minutesPerDay: number
  /**
   * Campos personalizados (Extended Attributes) disponíveis neste cronograma —
   * só os que alguma tarefa de fato preenche. fieldId bate com a chave usada em
   * WBSActivity.customFields; name é o Alias configurado no MS Project (ou
   * "Campo <FieldID>" quando o campo nunca foi renomeado).
   */
  customFieldDefs: { fieldId: string; name: string }[]
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÕES DE CONVERSÃO
// ═══════════════════════════════════════════════════════════════════

function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  const cleaned = dateStr.replace('Z', '')
  const date = new Date(cleaned)
  return isNaN(date.getTime()) ? undefined : date
}

function parseDuration(durStr: string | undefined, minutesPerDay = 540): number {
  if (!durStr) return 0
  const s = durStr.trim()
  const hoursPerDay = minutesPerDay / 60

  // Formato ISO: PT480H, P5DT8H30M, PT0H0M0S, etc.
  const isoMatch = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (isoMatch) {
    const days = parseInt(isoMatch[1] || '0')
    const hours = parseInt(isoMatch[2] || '0')
    const minutes = parseInt(isoMatch[3] || '0')
    return days * hoursPerDay * 60 + hours * 60 + minutes
  }

  // Formato com sufixo: "480h", "5d", "30m", "480H", "5D"
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i)
  const dMatch = s.match(/(\d+(?:\.\d+)?)\s*d/i)
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?!in)/i)
  if (hMatch || dMatch || mMatch) {
    let total = 0
    if (dMatch) total += parseFloat(dMatch[1]) * hoursPerDay * 60
    if (hMatch) total += parseFloat(hMatch[1]) * 60
    if (mMatch) total += parseFloat(mMatch[1])
    return Math.round(total)
  }

  // Número puro (tratar como minutos)
  const num = parseFloat(s)
  if (!isNaN(num)) return Math.round(num)

  return 0
}

/**
 * Converte duração ISO 8601 para horas decimais.
 * Ex: "PT5791H41M32.18S" → 5791.69
 * Ex: "PT0H0M0S" → 0
 * Ex: "P5DT8H30M" → 48.5
 */
function iso8601ToDecimalHours(durStr: string | undefined, minutesPerDay = 540): number {
  if (!durStr || durStr === 'PT0H0M0S' || durStr === 'PT0S') return 0
  const s = durStr.trim()
  const hoursPerDay = minutesPerDay / 60

  // Matches: PT5791H41M32.18S, P5DT8H30M, PT480H, PT0H0M0S, etc.
  const match = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (!match) return 0

  const days = parseInt(match[1] || '0')
  const hours = parseInt(match[2] || '0')
  const minutes = parseInt(match[3] || '0')
  const seconds = parseFloat(match[4] || '0')

  const totalHours = days * hoursPerDay + hours + (minutes / 60) + (seconds / 3600)
  return Math.round(totalHours * 100) / 100
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÕES DE AGRUPAMENTO TEMPORAL
// ═══════════════════════════════════════════════════════════════════

/**
 * Retorna o primeiro dia da semana para uma data, respeitando o dia de início
 * configurado no MS Project (weekStartDay: 0=dom, 1=seg, ..., 6=sáb).
 * Padrão = 5 (sexta) — valor histórico do sistema quando ausente no XML.
 */
function getWeekStart(date: Date, weekStartDay = 5): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=dom..6=sab
  const diff = (day - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Retorna chave de semana no formato "YYYY-MM-DD" (início da semana).
 */
function weekKey(date: Date, weekStartDay = 5): string {
  const ws = getWeekStart(date, weekStartDay)
  const y = ws.getFullYear()
  const m = String(ws.getMonth() + 1).padStart(2, '0')
  const d = String(ws.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Retorna label legível da semana: "dez/2025 (W51)"
 * Respeita o dia de início da semana do projeto (weekStartDay).
 */
function weekLabel(date: Date, weekStartDay = 5): string {
  const ws = getWeekStart(date, weekStartDay)
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const month = months[ws.getMonth()]
  const year = ws.getFullYear()
  // Calcular número da semana relativo ao dia inicial configurado
  const jan1 = new Date(year, 0, 1)
  const jan1Day = jan1.getDay()
  const daysToFirstWeekStart = (weekStartDay - jan1Day + 7) % 7
  const firstWeekStart = new Date(year, 0, 1 + daysToFirstWeekStart)
  const diffMs = ws.getTime() - firstWeekStart.getTime()
  const weekNum = Math.floor(diffMs / (7 * 86400000)) + 1
  return `${month}/${year} (W${String(weekNum).padStart(2, '0')})`
}

/**
 * Retorna chave de mês no formato "YYYY-MM".
 */
function monthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Retorna label de mês: "dez/2025"
 */
function monthLabel(date: Date): string {
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${months[date.getMonth()]}/${date.getFullYear()}`
}

/**
 * Retorna chave de dia no formato "YYYY-MM-DD".
 */
function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÃO DE EXTRAÇÃO DE TIMEPHASEDDATA
// ═══════════════════════════════════════════════════════════════════

/**
 * Extrai todos os TimephasedData de um elemento Assignment.
 *
 * Lógica:
 *  1. <TimephasedData> filhos diretos do <Assignment> → Type 1 (planejado),
 *     Type 2 (real), Type 22 (custo). Type 4 aqui é tratado como fallback BL0.
 *  2. <Baseline><Number>X</Number><TimephasedData>...</Baseline> aninhados →
 *     dados timephased por baseline específica, usando <Number> como índice.
 */
// Detecta o padrão de corrupção confirmado no pacote 728 (tarefa UID 15775): o
// Assignment tem <Baseline><Number>0> e <Baseline><Number>10> com o MESMO valor de
// <Work> — a Baseline 10 (sabidamente incorreta/não utilizada nesse projeto) vaza
// pro slot da Baseline 0. Comparar o valor exato (em vez de um limiar de "taxa
// implausível") evita falso-positivo em tarefas legítimas com trabalho concentrado.
const DUPLICATE_WORK_EPSILON_MINUTES = 1

function hasBl0DuplicatingBl10(assignment: Element, minutesPerDay: number): boolean {
  let bl0Work: number | undefined
  let bl10Work: number | undefined
  assignment.querySelectorAll(':scope > Baseline').forEach((bl) => {
    const num = parseInt(bl.querySelector('Number')?.textContent || '-1')
    if (num !== 0 && num !== 10) return
    const w = parseDuration(bl.querySelector('Work')?.textContent || undefined, minutesPerDay)
    if (num === 0) bl0Work = w
    if (num === 10) bl10Work = w
  })
  if (!bl0Work || !bl10Work) return false
  return Math.abs(bl0Work - bl10Work) < DUPLICATE_WORK_EPSILON_MINUTES
}

function extractTimephasedFromAssignment(
  assignment: Element,
  minutesPerDay = 540,
): { points: TimephasedDataPoint[] } {
  const points: TimephasedDataPoint[] = []
  const assignmentUid = parseInt(assignment.querySelector('UID')?.textContent || '0')

  if (assignmentUid <= 0) return { points }

  const suppressBl0 = hasBl0DuplicatingBl10(assignment, minutesPerDay)

  // :scope > (não querySelectorAll('TimephasedData') puro) — sem o escopo, a busca
  // pega QUALQUER <TimephasedData> em qualquer profundidade, inclusive os aninhados
  // dentro de <Baseline> (processados separadamente abaixo). O código só tinha uma
  // proteção manual contra esse vazamento para os Types 4 e 5; qualquer outro tipo
  // aninhado em <Baseline> (ex.: Types de baselines específicas além da 0) vazava
  // pra cá sem contexto de baselineIndex, inflando os totais e duplicando pontos.
  const allTpElements = assignment.querySelectorAll(':scope > TimephasedData')

  allTpElements.forEach((tp) => {
    const type = parseInt(tp.querySelector('Type')?.textContent || '0') as TimephasedDataType
    const startStr = tp.querySelector('Start')?.textContent
    const finishStr = tp.querySelector('Finish')?.textContent
    const unit = parseFloat(tp.querySelector('Unit')?.textContent || '1')
    const valueStr = tp.querySelector('Value')?.textContent

    if (!startStr || !finishStr || !valueStr) return

    const start = parseDate(startStr)
    const finish = parseDate(finishStr)
    if (!start || !finish) return

    const valueHours = iso8601ToDecimalHours(valueStr, minutesPerDay)

    const point: TimephasedDataPoint = {
      type,
      uid: assignmentUid,
      start,
      finish,
      unit,
      valueHours,
    }

    // Type 4 direto do Assignment → fallback BL0 (dados de baseline sem contexto de
    // <Baseline> aninhado — só ocorre aqui porque o seletor já garante que não é
    // um <TimephasedData> dentro de <Baseline>).
    if (type === 4) {
      if (suppressBl0) return
      point.baselineIndex = 0
    }

    // Type 5 direto do Assignment → fallback BL0 (alguns exports MSPDI usam Type 5
    // em vez de Type 4 para Baseline Work).
    if (type === 5) {
      if (suppressBl0) return
      point.baselineIndex = 0
      point.type = 4 // normaliza para Type 4 (Baseline Work) no restante do pipeline
    }

    points.push(point)
  })

  // ── Baselines aninhadas ────────────────────────────────────────
  // Cada <Baseline><Number>X</Number> dentro do Assignment contém
  // <TimephasedData> com o índice correto da baseline.
  const baselineElements = assignment.querySelectorAll(':scope > Baseline')
  baselineElements.forEach((bl) => {
    const blIndex = parseInt(bl.querySelector('Number')?.textContent || '0')
    if (blIndex === 0 && suppressBl0) return
    const blTpElements = bl.querySelectorAll(':scope > TimephasedData')

    blTpElements.forEach((tp) => {
      const type = parseInt(tp.querySelector('Type')?.textContent || '0') as TimephasedDataType
      // Type 4 ou Type 5 = Baseline Work
      if (type !== 4 && type !== 5) return

      const startStr = tp.querySelector('Start')?.textContent
      const finishStr = tp.querySelector('Finish')?.textContent
      const unit = parseFloat(tp.querySelector('Unit')?.textContent || '1')
      const valueStr = tp.querySelector('Value')?.textContent

      if (!startStr || !finishStr || !valueStr) return

      const start = parseDate(startStr)
      const finish = parseDate(finishStr)
      if (!start || !finish) return

      const valueHours = iso8601ToDecimalHours(valueStr, minutesPerDay)

      points.push({
        type: 4,
        uid: assignmentUid,
        start,
        finish,
        unit,
        valueHours,
        baselineIndex: blIndex,
      })
    })
  })

  return { points }
}

/**
 * Extrai e agrega dados timephased de todos os assignments do XML.
 * Quando não há TimephasedData no XML, gera dados sintéticos a partir
 * dos campos Work/ActualWork/BaselineWork das atividades e assignments.
 */
function extractTimephasedData(
  doc: Document,
  activities: WBSActivity[],
  granularity: 'day' | 'week' | 'month' = 'week',
  minutesPerDay = 540,
  weekStartDay = 5,
): TimephasedSeries {
  const allPoints: TimephasedDataPoint[] = []

  // Iterar por todos os Assignments (podem estar em Resources Assignment ou diretamente)
  const assignments = doc.querySelectorAll('Assignment')
  assignments.forEach((assignment) => {
    const { points } = extractTimephasedFromAssignment(assignment, minutesPerDay)
    for (const p of points) allPoints.push(p)
  })

  // Se não encontrou TimephasedData no XML, retorna indisponível
  if (allPoints.length === 0) {
    return {
      granularity,
      rawPoints: [],
      weeks: [],
      totals: { plannedHours: 0, actualHours: 0, baselineHours: {} },
      dateRange: { start: new Date(), end: new Date() },
      available: false,
      baselineIndices: new Set(),
    }
  }

  // Determinar período coberto — loop em vez de Math.min/max(...array): projetos
  // grandes podem ter dezenas/centenas de milhares de pontos timephased, e espalhar
  // um array desse tamanho como argumentos de função estoura a pilha de chamadas do JS.
  let rangeStartMs = Infinity
  let rangeEndMs = -Infinity
  for (const p of allPoints) {
    const s = p.start.getTime()
    const f = p.finish.getTime()
    if (s < rangeStartMs) rangeStartMs = s
    if (f > rangeEndMs) rangeEndMs = f
  }
  const rangeStart = new Date(rangeStartMs)
  const rangeEnd = new Date(rangeEndMs)

  // Type 16 (Baseline 1 Work) é uma codificação alternativa/legada que, neste tipo de
  // export, aparece DUPLICADA em relação ao bloco aninhado <Baseline><Number>1>
  // (Type 4/5 com baselineIndex=1) — os totais batem quase exatamente entre os dois,
  // confirmando que representam o MESMO dado, não fontes complementares. Somar os
  // dois dobra o total da BL1. Só usamos Type 16 como fallback quando o arquivo NÃO
  // traz a representação aninhada pra baseline 1 (formato mais antigo/diferente).
  const hasNestedBaseline1 = allPoints.some((p) => p.type === 4 && p.baselineIndex === 1)

  // Agrupar por período
  const grouped: Record<string, TimephasedWeek> = {}

  for (const point of allPoints) {
    let key: string
    let label: string
    let weekStartDate: Date

    switch (granularity) {
      case 'day':
        key = dayKey(point.start)
        label = point.start.toLocaleDateString('pt-BR')
        weekStartDate = new Date(point.start)
        break
      case 'month':
        key = monthKey(point.start)
        label = monthLabel(point.start)
        weekStartDate = new Date(point.start.getFullYear(), point.start.getMonth(), 1)
        break
      case 'week':
      default:
        key = weekKey(point.start, weekStartDay)
        label = weekLabel(point.start, weekStartDay)
        weekStartDate = getWeekStart(point.start, weekStartDay)
        break
    }

    if (!grouped[key]) {
      grouped[key] = {
        weekStart: weekStartDate,
        weekLabel: label,
        periodKey: key,
        planned: 0,
        actual: 0,
        baselines: {},
        costPlanned: 0,
      }
    }

    const entry = grouped[key]

    switch (point.type) {
      case 1: // Trabalho Planejado (Work) — distribuição do cronograma atual
        entry.planned += point.valueHours
        break
      case 2: // Trabalho Real (Actual Work)
        entry.actual += point.valueHours
        break
      case 4: { // Baseline 0 Work (ou Type 5 normalizado)
        const blIdx = point.baselineIndex ?? 0
        entry.baselines[blIdx] = (entry.baselines[blIdx] || 0) + point.valueHours
        break
      }
      case 5: { // Baseline Work (alguns exports usam Type 5 em vez de Type 4)
        const blIdx = point.baselineIndex ?? 0
        entry.baselines[blIdx] = (entry.baselines[blIdx] || 0) + point.valueHours
        break
      }
      case 16: { // Baseline 1 Work — só usa se o arquivo não tem a rep. aninhada (ver acima)
        if (hasNestedBaseline1) break
        entry.baselines[1] = (entry.baselines[1] || 0) + point.valueHours
        break
      }
      case 22: // Custo Acumulado
        entry.costPlanned += point.valueHours // valueHours contém valor em R$ para type 22
        break
      // Types 9, 10, 11, 18, 19, 24: ignorados (acumulados/unidades/custo)
    }
  }

  // Ordenar por período
  const sortedKeys = Object.keys(grouped).sort()
  const weeks: TimephasedWeek[] = sortedKeys.map((k) => grouped[k])

  // Calcular totais
  const totals = {
    plannedHours: weeks.reduce((sum, w) => sum + w.planned, 0),
    actualHours: weeks.reduce((sum, w) => sum + w.actual, 0),
    baselineHours: {} as Record<number, number>,
  }

  // Agregar totais de baseline — só conta como "disponível" quem tem valor > 0 de
  // fato acumulado; uma baseline pode ter entradas <Baseline> no XML sem nunca ter
  // sido efetivamente definida no MS Project (todas com valor 0), e nesse caso não
  // deve aparecer como opção selecionável na Curva S.
  const dataBaselineIndices = new Set<number>()
  for (const w of weeks) {
    for (const [blIdx, val] of Object.entries(w.baselines)) {
      const idx = parseInt(blIdx)
      totals.baselineHours[idx] = (totals.baselineHours[idx] || 0) + val
      if (val > 0) dataBaselineIndices.add(idx)
    }
  }

  return {
    granularity,
    rawPoints: allPoints,
    weeks,
    totals,
    dateRange: { start: rangeStart, end: rangeEnd },
    available: true,
    baselineIndices: dataBaselineIndices,
  }
}

// ═══════════════════════════════════════════════════════════════════
// FALLBACK — DISTRIBUIÇÃO SINTÉTICA DE BASELINES SEM TIMEPHASED NATIVO
// ═══════════════════════════════════════════════════════════════════

const MAX_SYNTHETIC_SPAN_DAYS = 3650 // ~10 anos — guarda-chuva contra datas corrompidas

/**
 * Alguns exports do MS Project só gravam TimephasedData (Type 4) distribuído no tempo
 * para PARTE das tarefas/alocações de uma baseline — o resto fica só com o total
 * agregado por tarefa (via <Baseline><Number>/<Start>/<Finish>/<Work> aninhado no
 * Task, sem granularidade temporal). Isso é comum em cronogramas re-baselineados: a
 * baseline "corrente" pode ter cobertura completa em algumas tarefas (as que já
 * tinham apontamento quando foi salva) e nenhuma nas demais.
 *
 * Corrigir isso exige sintetizar POR TAREFA, não pular a baseline inteira só porque
 * ALGUMA tarefa já tem dado nativo — a versão anterior fazia exatamente isso
 * (`if (baselineIndices.has(i)) continue`), então bastava 1 tarefa ter cobertura
 * nativa pra que as outras centenas de tarefas com só o total agregado (sem
 * distribuição temporal) ficassem de fora inteiramente do Avanço/Aderência daquela
 * baseline — subestimando o total real dela em milhões de horas.
 *
 * Para cada tarefa sem dado nativo NA baseline i, distribui o Work dela linearmente
 * (dia a dia) entre o Start/Finish daquela própria baseline — mesma técnica usada por
 * ferramentas de mercado (ex. Oliplan) quando o XML não carrega a distribuição real.
 * Tarefas-resumo são ignoradas (o Work delas já é o rollup dos filhos).
 *
 * O orçamento sintético é dividido entre as ALOCAÇÕES da tarefa (proporcional ao
 * Work de cada uma), não atribuído ao uid da tarefa — capActualByAssignmentBaseline
 * (curve-utils.ts) casa o orçamento de baseline com o Trabalho Real (Type 2) pelo uid
 * da ALOCAÇÃO, que é sempre diferente do uid da tarefa no MS Project. Sintetizar no
 * uid da tarefa deixaria esse orçamento invisível pro cálculo de Avanço Real — a
 * baseline apareceria completa no gráfico, mas o Real da tarefa continuaria sendo
 * descartado por "falta de baseline".
 */
function synthesizeMissingBaselineDistributions(
  activities: WBSActivity[],
  assignments: WBSAssignment[],
  timephased: TimephasedSeries,
): void {
  const taskUidByAssignmentUid = new Map<number, number>()
  const assignmentsByTaskUid = new Map<number, WBSAssignment[]>()
  for (const a of assignments) {
    taskUidByAssignmentUid.set(a.uid, a.taskUid)
    const list = assignmentsByTaskUid.get(a.taskUid)
    if (list) list.push(a)
    else assignmentsByTaskUid.set(a.taskUid, [a])
  }

  for (let i = 0; i <= 10; i++) {
    // Tarefas que já têm TimephasedData nativo pra essa baseline (via alguma das
    // próprias alocações) — sintetiza só as que faltam.
    const coveredTaskUids = new Set<number>()
    for (const p of timephased.rawPoints) {
      if (p.type !== 4 || (p.baselineIndex ?? 0) !== i) continue
      coveredTaskUids.add(taskUidByAssignmentUid.get(p.uid) ?? p.uid)
    }

    const syntheticPoints: TimephasedDataPoint[] = []

    for (const act of activities) {
      if (act.isSummary) continue
      if (coveredTaskUids.has(act.uid)) continue // já tem dado nativo pra essa tarefa
      const bl = act.baselines[i]
      if (!bl || bl.work <= 0 || !bl.start || !bl.finish) continue

      const startMs = bl.start.getTime()
      const finishMs = bl.finish.getTime()
      if (finishMs < startMs) continue

      const totalDays = Math.min(
        MAX_SYNTHETIC_SPAN_DAYS,
        Math.round((finishMs - startMs) / 86400000) + 1,
      )
      const workHours = bl.work / 60 // bl.work está em minutos
      const perDayHours = workHours / totalDays

      const taskAssignments = assignmentsByTaskUid.get(act.uid) || []
      const totalAssignedWork = taskAssignments.reduce((s, a) => s + a.work, 0)
      const shares: { uid: number; fraction: number }[] = taskAssignments.length > 0
        ? (totalAssignedWork > 0
            ? taskAssignments.map((a) => ({ uid: a.uid, fraction: a.work / totalAssignedWork }))
            : taskAssignments.map((a) => ({ uid: a.uid, fraction: 1 / taskAssignments.length })))
        : [{ uid: act.uid, fraction: 1 }] // sem alocação conhecida: cai no uid da tarefa mesmo

      for (const share of shares) {
        const shareHoursPerDay = perDayHours * share.fraction
        if (shareHoursPerDay <= 0) continue
        for (let d = 0; d < totalDays; d++) {
          const dayStart = new Date(startMs + d * 86400000)
          const dayFinish = new Date(dayStart.getTime() + 86400000)
          syntheticPoints.push({
            type: 4,
            uid: share.uid,
            start: dayStart,
            finish: dayFinish,
            unit: 1,
            valueHours: shareHoursPerDay,
            baselineIndex: i,
          })
        }
      }
    }

    if (syntheticPoints.length === 0) continue

    // Loop em vez de push(...syntheticPoints): com muitas atividades e até
    // MAX_SYNTHETIC_SPAN_DAYS pontos diários cada, esse array pode chegar a milhões
    // de elementos — espalhar como argumentos de função estoura a pilha do JS.
    for (const p of syntheticPoints) timephased.rawPoints.push(p)
    timephased.baselineIndices.add(i)
    const total = syntheticPoints.reduce((sum, p) => sum + p.valueHours, 0)
    timephased.totals.baselineHours[i] = (timephased.totals.baselineHours[i] || 0) + total
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARSER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export function parseMSProjectXML(xmlString: string): ParsedProject {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('XML inválido: ' + parseError.textContent)
  }

  const project = doc.querySelector('Project') || doc.querySelector('project')
  if (!project) {
    throw new Error('Não foi possível encontrar o elemento Project no XML')
  }

  const projectName = project.querySelector('Name')?.textContent || 'Projeto Sem Nome'
  const startDate = parseDate(project.querySelector('StartDate')?.textContent || undefined) || new Date()
  const finishDate = parseDate(project.querySelector('FinishDate')?.textContent || undefined) || new Date()
  const author = project.querySelector('Author')?.textContent || ''
  const company = project.querySelector('Company')?.textContent || ''
  const description = project.querySelector('Title')?.textContent || project.querySelector('Subject')?.textContent || ''

  // "A semana começa no(a)" (Opções > Cronograma) — 0=domingo..6=sábado, igual Date.getDay()
  const weekStartDayRaw = parseInt(project.querySelector('WeekStartDay')?.textContent ?? '', 10)
  const weekStartDay = weekStartDayRaw >= 0 && weekStartDayRaw <= 6 ? weekStartDayRaw : 5

  // Minutos de trabalho por dia — MS Project padrão = 540 (9 horas)
  const minutesPerDayRaw = parseInt(project.querySelector('MinutesPerDay')?.textContent ?? '', 10)
  const minutesPerDay = minutesPerDayRaw > 0 ? minutesPerDayRaw : 540

  // ─── Definições de campos personalizados (Extended Attributes) ───────────────
  // <Project><ExtendedAttributes><ExtendedAttribute> define o nome (Alias) de cada
  // campo customizado do MS Project (FieldID). O valor por tarefa vem num elemento
  // de MESMO NOME dentro de <Task> (por isso o ":scope >" pra não misturar os dois).
  // Sem Alias, cai pro FieldName; sem nenhum dos dois, "Campo <FieldID>" (mesmo
  // rótulo que o MS Project usa quando o campo nunca foi renomeado).
  const customFieldNames = new Map<string, string>()
  project.querySelector(':scope > ExtendedAttributes')?.querySelectorAll(':scope > ExtendedAttribute').forEach((ea) => {
    const fieldId = ea.querySelector('FieldID')?.textContent || ''
    if (!fieldId) return
    const alias = ea.querySelector('Alias')?.textContent?.trim()
    const fieldName = ea.querySelector('FieldName')?.textContent?.trim()
    customFieldNames.set(fieldId, alias || fieldName || `Campo ${fieldId}`)
  })
  // Só entram na lista de colunas filtráveis os campos que algum Task de fato usa —
  // evita poluir o seletor de coluna com dezenas de campos definidos mas vazios.
  const usedCustomFieldIds = new Set<string>()

  // ─── Extrair datas de salvamento das baselines ───────────────
  const baselineSavedDates: (Date | undefined)[] = []
  for (let i = 0; i <= 10; i++) {
    const prefix = i === 0 ? '' : String(i)
    const dateStr = project.querySelector(`Baseline${prefix}SavedDate`)?.textContent
    baselineSavedDates.push(parseDate(dateStr || undefined))
  }

  // ─── Extrair Tasks ───────────────────────────────────────────
  const taskElements = doc.querySelectorAll('Task')
  const activities: WBSActivity[] = []

  taskElements.forEach((task) => {
    const uid = parseInt(task.querySelector('UID')?.textContent || '0')
    const id = task.querySelector('ID')?.textContent || '0'
    const name = task.querySelector('Name')?.textContent || ''
    const wbs = task.querySelector('WBS')?.textContent || ''
    const outlineLevel = parseInt(task.querySelector('OutlineLevel')?.textContent || '0')
    const outlineNumber = task.querySelector('OutlineNumber')?.textContent || ''
    const isMilestone = task.querySelector('Milestone')?.textContent === '1' || task.querySelector('Milestone')?.textContent === 'true'
    const isSummary = task.querySelector('Summary')?.textContent === '1' || task.querySelector('Summary')?.textContent === 'true'

    const start = parseDate(task.querySelector('Start')?.textContent || undefined) || new Date()
    const finish = parseDate(task.querySelector('Finish')?.textContent || undefined) || new Date()
    const duration = parseDuration(task.querySelector('Duration')?.textContent || undefined, minutesPerDay)
    const percentComplete = parseFloat(task.querySelector('PercentComplete')?.textContent || task.querySelector('PercentWorkComplete')?.textContent || '0')

    const actualStart = parseDate(task.querySelector('ActualStart')?.textContent || undefined)
    const actualFinish = parseDate(task.querySelector('ActualFinish')?.textContent || undefined)
    const actualDuration = parseDuration(task.querySelector('ActualDuration')?.textContent || undefined, minutesPerDay)
    const remainingDuration = parseDuration(task.querySelector('RemainingDuration')?.textContent || undefined, minutesPerDay)

    const baselineStart = parseDate(task.querySelector('BaselineStart')?.textContent || undefined)
    const baselineFinish = parseDate(task.querySelector('BaselineFinish')?.textContent || undefined)
    const baselineDuration = parseDuration(task.querySelector('BaselineDuration')?.textContent || undefined, minutesPerDay)

    const cost = parseFloat(task.querySelector('Cost')?.textContent || '0')
    const actualCost = parseFloat(task.querySelector('ActualCost')?.textContent || '0')
    const work = parseDuration(task.querySelector('Work')?.textContent || undefined, minutesPerDay)
    const actualWork = parseDuration(task.querySelector('ActualWork')?.textContent || undefined, minutesPerDay)
    const priority = parseInt(task.querySelector('Priority')?.textContent || '0')
    const calendarName = task.querySelector('CalendarUID')?.textContent || ''
    const notes = task.querySelector('Notes')?.textContent || ''

    // Extrair baselines BL0-BL10 (tags planas Baseline{n}Work/Cost — sem datas)
    const baselines: BaselineData[] = []
    for (let i = 0; i <= 10; i++) {
      const prefix = i === 0 ? '' : String(i)
      const blWork = parseDuration(task.querySelector(`Baseline${prefix}Work`)?.textContent || undefined, minutesPerDay)
      const blCost = parseFloat(task.querySelector(`Baseline${prefix}Cost`)?.textContent || '0')
      baselines.push({ work: blWork, cost: blCost })
    }

    // Elementos <Baseline><Number>/<Start>/<Finish>/<Work> aninhados sob o Task — trazem
    // as datas de início/término de CADA linha de base (as tags planas acima não têm data).
    // Usado para gerar uma distribuição sintética quando o XML não traz TimephasedData
    // nativo para essa baseline (ver synthesizeMissingBaselineDistributions).
    //
    // Prioridade: quando a tarefa tem AMBAS as representações da mesma baseline, o
    // valor do bloco aninhado <Baseline><Number> vence, mesmo que a tag plana legada
    // (Baseline{n}Work) já tenha um valor. A tag plana só existe pra baseline 0 por
    // compatibilidade com versões antigas do MS Project — em projetos re-baselineados
    // várias vezes ela pode ficar "presa" num valor antigo enquanto o bloco aninhado
    // reflete o estado atual. Usar a tag plana como prioridade (comportamento anterior)
    // inflava o total da BL0 nesses casos.
    // Detecta o mesmo padrão de corrupção da Baseline 10 vazando pra Baseline 0 (ver
    // hasBl0DuplicatingBl10 para o Assignment) — aqui ao nível da própria Task.
    const taskBl0Work = parseDuration(
      Array.from(task.querySelectorAll(':scope > Baseline')).find((bl) => bl.querySelector('Number')?.textContent === '0')?.querySelector('Work')?.textContent || undefined,
      minutesPerDay,
    )
    const taskBl10Work = parseDuration(
      Array.from(task.querySelectorAll(':scope > Baseline')).find((bl) => bl.querySelector('Number')?.textContent === '10')?.querySelector('Work')?.textContent || undefined,
      minutesPerDay,
    )
    const taskBl0DuplicatesBl10 = taskBl0Work > 0 && taskBl10Work > 0 && Math.abs(taskBl0Work - taskBl10Work) < DUPLICATE_WORK_EPSILON_MINUTES

    task.querySelectorAll(':scope > Baseline').forEach((bl) => {
      const num = parseInt(bl.querySelector('Number')?.textContent || '-1')
      if (num < 0 || num > 10) return
      const s = parseDate(bl.querySelector('Start')?.textContent || undefined)
      const f = parseDate(bl.querySelector('Finish')?.textContent || undefined)
      let w = parseDuration(bl.querySelector('Work')?.textContent || undefined, minutesPerDay)
      if (num === 0 && taskBl0DuplicatesBl10) w = 0
      if (s) baselines[num].start = s
      if (f) baselines[num].finish = f
      if (w > 0) baselines[num].work = w
    })

    // Campos personalizados MS Project
    const text1 = task.querySelector('Text1')?.textContent || ''
    const text2 = task.querySelector('Text2')?.textContent || ''
    const text3 = task.querySelector('Text3')?.textContent || ''
    const number1 = parseFloat(task.querySelector('Number1')?.textContent || '0')
    const number2 = parseFloat(task.querySelector('Number2')?.textContent || '0')

    // Campos personalizados (Extended Attributes) — qualquer coluna que o usuário
    // criou/renomeou no MS Project (ex.: "Disciplina", "Categoria"), não só os 3
    // campos de texto genéricos acima. Chaveado por FieldID (string).
    const customFields: Record<string, string> = {}
    task.querySelectorAll(':scope > ExtendedAttribute').forEach((ea) => {
      const fieldId = ea.querySelector('FieldID')?.textContent || ''
      const value = ea.querySelector('Value')?.textContent?.trim() || ''
      if (!fieldId || !value) return
      customFields[fieldId] = value
      usedCustomFieldIds.add(fieldId)
    })

    const predecessorUids: number[] = []
    const links = task.querySelectorAll('PredecessorLink')
    links.forEach((link) => {
      const predUid = parseInt(link.querySelector('PredecessorUID')?.textContent || '0')
      if (predUid > 0) predecessorUids.push(predUid)
    })

    const resourceUids: number[] = []
    const taskAssignments = task.querySelectorAll('Assignment')
    taskAssignments.forEach((a) => {
      const rUid = parseInt(a.querySelector('ResourceUID')?.textContent || '0')
      if (rUid > 0) resourceUids.push(rUid)
    })

    // Tentar extrair responsável de campos personalizados. O fallback pelo nome só
    // faz sentido quando a tarefa segue a convenção "Atividade - Responsável" (com
    // separador de fato); sem separador, `.pop()` devolveria o próprio nome da tarefa
    // como se fosse um responsável, poluindo filtros e agrupamentos por responsável.
    const nameParts = name.split(' - ')
    const responsible = text1 || text2 || (nameParts.length > 1 ? nameParts[nameParts.length - 1].trim() : '')
    const discipline = text3 || ''
    const area = ''

    if (uid > 0 && name) {
      activities.push({
        id, uid, name, wbs, outlineLevel, outlineNumber,
        start, finish, duration, durationFormat: 7, percentComplete,
        actualStart: actualStart || undefined,
        actualFinish: actualFinish || undefined,
        actualDuration: actualDuration || undefined,
        remainingDuration: remainingDuration || undefined,
        predecessorUids, resourceUids, isMilestone, isSummary,
        baselineStart: baselineStart || undefined,
        baselineFinish: baselineFinish || undefined,
        baselineDuration: baselineDuration || undefined,
        cost: cost || undefined,
        actualCost: actualCost || undefined,
        work: work || undefined,
        actualWork: actualWork || undefined,
        baselines,
        responsible, discipline, area, notes,
        priority, calendarName,
        text1, text2, text3, number1, number2,
        customFields,
      })
    }
  })

  // ─── Extrair Resources ───────────────────────────────────────
  const resourceElements = doc.querySelectorAll('Resource')
  const resources: WBSResource[] = []

  resourceElements.forEach((res) => {
    const uid = parseInt(res.querySelector('UID')?.textContent || '0')
    const name = res.querySelector('Name')?.textContent || ''
    const type = parseInt(res.querySelector('Type')?.textContent || '1')
    const initials = res.querySelector('Initials')?.textContent || name.charAt(0)
    const group = res.querySelector('Group')?.textContent || ''
    const maxUnits = parseFloat(res.querySelector('MaxUnits')?.textContent || '1')
    const peakUnits = parseFloat(res.querySelector('PeakUnits')?.textContent || '0')
    const baseRate = parseFloat(res.querySelector('StandardRate')?.textContent || '0')
    const costPerUse = parseFloat(res.querySelector('CostPerUse')?.textContent || '0')
    const email = res.querySelector('EmailAddress')?.textContent || ''
    const phone = res.querySelector('WindowsUserAccount')?.textContent || ''
    const code = res.querySelector('Code')?.textContent || ''
    const role = res.querySelector('TypeName')?.textContent || group || ''

    if (uid > 0 && name) {
      resources.push({
        uid, name, type, initials, group, maxUnits, peakUnits, baseRate, costPerUse,
        role, email, phone, code,
      })
    }
  })

  // ─── Extrair Assignments ─────────────────────────────────────
  const assignmentElements = doc.querySelectorAll('Assignment')
  const assignments: WBSAssignment[] = []

  // Acumular work por task vindo dos assignments
  const assignmentWorkByTask: Record<number, { work: number; actualWork: number; cost: number; actualCost: number }> = {}

  assignmentElements.forEach((assign) => {
    const uid = parseInt(assign.querySelector('UID')?.textContent || '0')
    const taskUid = parseInt(assign.querySelector('TaskUID')?.textContent || '0')
    const resourceUid = parseInt(assign.querySelector('ResourceUID')?.textContent || '0')
    const units = parseFloat(assign.querySelector('Units')?.textContent || '1')
    const work = parseDuration(assign.querySelector('Work')?.textContent || undefined, minutesPerDay)
    const actualWork = parseDuration(assign.querySelector('ActualWork')?.textContent || undefined, minutesPerDay)
    const cost = parseFloat(assign.querySelector('Cost')?.textContent || '0')
    const actualCost = parseFloat(assign.querySelector('ActualCost')?.textContent || '0')
    const delay = parseDuration(assign.querySelector('Delay')?.textContent || undefined, minutesPerDay)
    const levelingDelay = parseDuration(assign.querySelector('LevelingDelay')?.textContent || undefined, minutesPerDay)

    // Extrair baseline work do assignment
    const baselineElements = assign.querySelectorAll('Baseline')
    const assignmentBaselines: BaselineData[] = []
    const assignBl0DuplicatesBl10 = hasBl0DuplicatingBl10(assign, minutesPerDay)
    baselineElements.forEach((bl) => {
      const blNumber = parseInt(bl.querySelector('Number')?.textContent || '0')
      let blWork = parseDuration(bl.querySelector('Work')?.textContent || undefined, minutesPerDay)
      const blCost = parseFloat(bl.querySelector('Cost')?.textContent || '0')
      if (blNumber === 0 && assignBl0DuplicatesBl10) blWork = 0
      if (blNumber >= 0 && blNumber <= 10) {
        assignmentBaselines[blNumber] = { work: blWork, cost: blCost }
      }
    })

    // Acumular work por task
    if (taskUid > 0) {
      if (!assignmentWorkByTask[taskUid]) {
        assignmentWorkByTask[taskUid] = { work: 0, actualWork: 0, cost: 0, actualCost: 0 }
      }
      assignmentWorkByTask[taskUid].work += work
      assignmentWorkByTask[taskUid].actualWork += actualWork
      assignmentWorkByTask[taskUid].cost += cost
      assignmentWorkByTask[taskUid].actualCost += actualCost

      // Enriquecer baselines do task com dados do assignment quando a task não tem
      // valor próprio. O filtro de taxa implausível acima já descarta o dado
      // corrompido de origem antes de chegar aqui, então não precisa checar se a
      // task "declara" a baseline — isso bloqueava enriquecimento legítimo em tasks
      // que só têm Work no Assignment (padrão comum neste tipo de arquivo).
      const taskAct = activities.find((a) => a.uid === taskUid)
      if (taskAct) {
        for (let bi = 0; bi < assignmentBaselines.length; bi++) {
          const abl = assignmentBaselines[bi]
          if (abl && abl.work > 0 && taskAct.baselines[bi]) {
            if (taskAct.baselines[bi].work === 0) {
              taskAct.baselines[bi].work = abl.work
            }
            if (taskAct.baselines[bi].cost === 0 && abl.cost > 0) {
              taskAct.baselines[bi].cost = abl.cost
            }
          }
        }
      }
    }

    if (uid > 0) {
      assignments.push({
        uid, taskUid, resourceUid, units, work, actualWork, cost, actualCost,
        delay, levelingDelay,
      })
    }
  })

  // Enriquecer atividades com work dos assignments (quando task-level não tem)
  for (const act of activities) {
    const aw = assignmentWorkByTask[act.uid]
    if (aw) {
      if (!act.work || act.work === 0) act.work = aw.work
      if (!act.actualWork || act.actualWork === 0) act.actualWork = aw.actualWork
      if (!act.cost || act.cost === 0) act.cost = aw.cost
      if (!act.actualCost || act.actualCost === 0) act.actualCost = aw.actualCost
    }
  }

  // ─── Extrair TimephasedData (Curva S real) ───────────────────
  // Passa weekStartDay para que o agrupamento semanal interno respeite o
  // calendário do projeto ("A semana começa no(a)" do MS Project).
  const timephased = extractTimephasedData(doc, activities, 'week', minutesPerDay, weekStartDay)

  // ─── Fallback: baselines sem TimephasedData nativo ───────────
  synthesizeMissingBaselineDistributions(activities, assignments, timephased)

  // ─── Detectar baselines disponíveis ──────────────────────────
  const baselineLabels = [
    'Baseline 0 (original)',
    'Baseline 1 (revisão 1)',
    'Baseline 2 (revisão 2)',
    'Baseline 3 (revisão 3)',
    'Baseline 4 (revisão 4)',
    'Baseline 5 (revisão 5)',
    'Baseline 6 (revisão 6)',
    'Baseline 7 (revisão 7)',
    'Baseline 8 (revisão 8)',
    'Baseline 9 (revisão 9)',
    'Baseline 10 (revisão 10)',
  ]

  // Enriquecer baseline availability com dados timephased
  const baselines: BaselineInfo[] = baselineLabels.map((label, i) => {
    // Totais do task-level — exclui tarefas-resumo (isSummary): Baseline{i}Work nelas é o
    // rollup agregado dos filhos, somar junto conta o mesmo trabalho duas vezes por nível de WBS.
    const taskTotalWork = activities.reduce((sum, a) => sum + (a.isSummary ? 0 : a.baselines[i]?.work || 0), 0)
    const taskTotalCost = activities.reduce((sum, a) => sum + (a.isSummary ? 0 : a.baselines[i]?.cost || 0), 0)
    // Totais do timephased
    const tpTotalWork = timephased.totals.baselineHours[i] || 0
    // Baseline tem dados timephased distribuídos?
    const hasTimephased = timephased.baselineIndices.has(i)

    return {
      id: `BL${i}`,
      index: i,
      label,
      // Disponível apenas se tem dados timephased distribuídos no XML
      available: hasTimephased,
      totalWork: taskTotalWork > 0 ? taskTotalWork : Math.round(tpTotalWork * 60),
      totalCost: taskTotalCost,
      savedDate: baselineSavedDates[i],
      hasTimephased,
    }
  })

  const customFieldDefs = Array.from(usedCustomFieldIds)
    .map((fieldId) => ({ fieldId, name: customFieldNames.get(fieldId) || `Campo ${fieldId}` }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    name: projectName, startDate, finishDate, author, company, description,
    activities, resources, assignments, baselines,
    timephased, weekStartDay, minutesPerDay, customFieldDefs,
  }
}
