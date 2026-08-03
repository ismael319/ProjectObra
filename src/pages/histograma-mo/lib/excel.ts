import type { WorkBook } from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { LinhaTabela, Problema } from '@/lib/administracao/parse-shared'
import { type Cargo, type Categoria, normalizarNomeCargo } from './histograma-db'

const TAMANHO_LOTE = 500

const CATEGORIA_LABEL: Record<Categoria, string> = { D: 'Direta (MOD)', I: 'Indireta (MOI)' }

function categoriaLabel(c: Categoria | null): string {
  return c ? CATEGORIA_LABEL[c] : ''
}

function categoriaDeTexto(texto: string): Categoria | null {
  const t = texto.trim().toUpperCase()
  if (t.startsWith('D')) return 'D'
  if (t.startsWith('I')) return 'I'
  return null
}

function formatarDataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function parseDataBR(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`
}

function parseNumero(texto: string): number | null {
  if (texto.trim() === '') return null
  const n = Number(texto.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

// Formato largo — uma semana por coluna, igual à grade da tela (mais fácil
// de conferir e editar em lote que uma linha por cargo x semana). Cada
// cargo vira duas linhas (Planejado/Real), igual ao "Lançamento semanal".
// A reimportação lê as datas do próprio cabeçalho (não assume posição fixa
// nem que bate com as semanas atuais do projeto), então funciona mesmo se
// o intervalo de semanas tiver mudado desde a exportação.
export async function buildHistogramaWorkbook(
  cargos: Cargo[],
  semanas: { iso: string; monthKey: string }[],
  planejadoMap: Map<string, number>,
  realMap: Map<string, number>,
): Promise<WorkBook> {
  const XLSX = await import('xlsx')
  const linhas: (string | number)[][] = [['Cargo', 'Categoria', 'Linha', ...semanas.map((s) => formatarDataBR(s.iso))]]
  for (const cargo of cargos) {
    linhas.push([
      cargo.nome,
      categoriaLabel(cargo.categoria),
      'Planejado',
      ...semanas.map((s) => planejadoMap.get(`${cargo.id}__${s.monthKey}`) ?? 0),
    ])
    linhas.push([
      cargo.nome,
      categoriaLabel(cargo.categoria),
      'Real',
      ...semanas.map((s) => realMap.get(`${cargo.id}__${s.iso}`) ?? ''),
    ])
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, ...semanas.map(() => ({ wch: 10 }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Histograma')
  return wb
}

export async function downloadHistogramaWorkbook(wb: WorkBook) {
  const XLSX = await import('xlsx')
  const hoje = new Date().toISOString().slice(0, 10).split('-').reverse().join('')
  XLSX.writeFile(wb, `Histograma_MO_${hoje}.xlsx`)
}

export interface LinhaImportada {
  cargoNome: string
  categoria: Categoria | null
  semanaIso: string
  planejado: number | null
  real: number | null
}

export interface ResultadoParseHistograma {
  linhas: LinhaImportada[]
  problemas: Problema[]
}

// Espera o mesmo formato de buildHistogramaWorkbook: cabeçalho com as datas
// das semanas a partir da 4ª coluna, e duas linhas por cargo (uma
// "Planejado", uma "Real"). As datas vêm do próprio cabeçalho — não assume
// que as colunas batem com as semanas atuais do projeto.
export function parseHistogramaLinhas(linhas: LinhaTabela[]): ResultadoParseHistograma {
  const problemas: Problema[] = []
  if (linhas.length === 0) return { linhas: [], problemas }

  const cabecalho = linhas[0]!
  const semanasIso = cabecalho.slice(3).map((texto) => parseDataBR(texto))
  cabecalho.slice(3).forEach((texto, idx) => {
    if (!semanasIso[idx] && texto.trim() !== '') {
      problemas.push({ linha: 1, campo: `Coluna ${idx + 4}`, descricao: `Data "${texto}" não reconhecida no cabeçalho (esperado DD/MM/AAAA) — coluna ignorada.` })
    }
  })

  const porCargoSemana = new Map<string, LinhaImportada>()
  let cargoAtual: string | null = null
  let categoriaAtual: Categoria | null = null

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i]!
    if (linha.every((c) => c.trim() === '')) continue
    const [cargoCol, categoriaCol, linhaTipo, ...valores] = linha

    if (cargoCol?.trim()) {
      cargoAtual = cargoCol.trim()
      categoriaAtual = categoriaCol ? categoriaDeTexto(categoriaCol) : null
    }
    if (!cargoAtual) {
      problemas.push({ linha: i + 1, campo: 'Cargo', descricao: 'Linha sem cargo definido — ignorada.' })
      continue
    }

    const tipo = linhaTipo?.trim().toLowerCase()
    if (tipo !== 'planejado' && tipo !== 'real') {
      problemas.push({ linha: i + 1, campo: 'Linha', descricao: `"${linhaTipo}" não reconhecido (esperado "Planejado" ou "Real") — linha ignorada.` })
      continue
    }

    valores.forEach((valorTexto, idx) => {
      const semanaIso = semanasIso[idx]
      if (!semanaIso) return
      const chave = `${cargoAtual}__${semanaIso}`
      const num = parseNumero(valorTexto ?? '')
      const atual = porCargoSemana.get(chave) ?? { cargoNome: cargoAtual!, categoria: categoriaAtual, semanaIso, planejado: null, real: null }
      if (tipo === 'planejado') atual.planejado = num
      else atual.real = num
      porCargoSemana.set(chave, atual)
    })
  }

  return { linhas: [...porCargoSemana.values()], problemas }
}

export interface ResumoImportacaoHistograma {
  cargosCriados: number
  valoresPlanejadoGravados: number
  valoresRealGravados: number
}

// Cargos citados na planilha que ainda não existem no projeto são criados
// (mesmo espírito de resolverOuCriarCatalogo em administracao/db.ts).
// Planejado só é gravado se houver uma baseline ativa (não dá pra upsert em
// histograma_planejado sem baseline_id) — real semanal sempre pode.
export async function importarHistograma(params: {
  projetoId: string
  baselineAtivaId: string | null
  tipo: Cargo['tipo']
  cargosExistentes: Cargo[]
  linhas: LinhaImportada[]
}): Promise<ResumoImportacaoHistograma> {
  const { projetoId, baselineAtivaId, tipo, cargosExistentes, linhas } = params

  const cargoPorNome = new Map(cargosExistentes.map((c) => [normalizarNomeCargo(c.nome), c]))
  const nomesNovos = new Map<string, { nome: string; categoria: Categoria | null }>()
  for (const l of linhas) {
    const chave = normalizarNomeCargo(l.cargoNome)
    if (!cargoPorNome.has(chave) && !nomesNovos.has(chave)) nomesNovos.set(chave, { nome: l.cargoNome, categoria: l.categoria })
  }

  if (nomesNovos.size > 0) {
    const { data, error } = await supabase
      .from('histograma_cargos')
      .insert([...nomesNovos.values()].map((c) => ({ projeto_id: projetoId, nome: c.nome, categoria: c.categoria, tipo })))
      .select('*')
    if (error) throw new Error(error.message)
    for (const c of data as Cargo[]) cargoPorNome.set(normalizarNomeCargo(c.nome), c)
  }

  const planejadoPorChave = new Map<string, { baseline_id: string; cargo_id: string; mes: string; qtd_planejada: number }>()
  const reaisPorChave = new Map<string, { projeto_id: string; cargo_id: string; semana_ref: string; qtd_real: number }>()

  for (const linha of linhas) {
    const cargo = cargoPorNome.get(normalizarNomeCargo(linha.cargoNome))
    if (!cargo) continue
    if (linha.planejado !== null && baselineAtivaId) {
      const mes = `${linha.semanaIso.slice(0, 7)}-01`
      planejadoPorChave.set(`${cargo.id}__${mes}`, { baseline_id: baselineAtivaId, cargo_id: cargo.id, mes, qtd_planejada: linha.planejado })
    }
    if (linha.real !== null) {
      reaisPorChave.set(`${cargo.id}__${linha.semanaIso}`, { projeto_id: projetoId, cargo_id: cargo.id, semana_ref: linha.semanaIso, qtd_real: linha.real })
    }
  }

  const planejadoRows = [...planejadoPorChave.values()]
  for (let i = 0; i < planejadoRows.length; i += TAMANHO_LOTE) {
    const lote = planejadoRows.slice(i, i + TAMANHO_LOTE)
    const { error } = await supabase.from('histograma_planejado').upsert(lote, { onConflict: 'baseline_id,cargo_id,mes' })
    if (error) throw new Error(error.message)
  }

  const reaisRows = [...reaisPorChave.values()]
  for (let i = 0; i < reaisRows.length; i += TAMANHO_LOTE) {
    const lote = reaisRows.slice(i, i + TAMANHO_LOTE)
    const { error } = await supabase.from('histograma_real_semanal').upsert(lote, { onConflict: 'cargo_id,semana_ref' })
    if (error) throw new Error(error.message)
  }

  return {
    cargosCriados: nomesNovos.size,
    valoresPlanejadoGravados: planejadoRows.length,
    valoresRealGravados: reaisRows.length,
  }
}
