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

// Formato longo (uma linha por cargo x semana) em vez de espelhar a grade
// (uma coluna por semana): mais fácil de reimportar depois, já que o
// intervalo de semanas do projeto pode mudar — colunas fixas quebrariam a
// reimportação.
const CABECALHO = ['Cargo', 'Categoria', 'Semana', 'Planejado (mês)', 'Real (semana)']

export async function buildHistogramaWorkbook(
  cargos: Cargo[],
  semanas: { iso: string; monthKey: string }[],
  planejadoMap: Map<string, number>,
  realMap: Map<string, number>,
): Promise<WorkBook> {
  const XLSX = await import('xlsx')
  const linhas: (string | number)[][] = [CABECALHO]
  for (const cargo of cargos) {
    for (const s of semanas) {
      linhas.push([
        cargo.nome,
        categoriaLabel(cargo.categoria),
        formatarDataBR(s.iso),
        planejadoMap.get(`${cargo.id}__${s.monthKey}`) ?? 0,
        realMap.get(`${cargo.id}__${s.iso}`) ?? '',
      ])
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }]
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
  linha: number
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

// Espera o mesmo formato de buildHistogramaWorkbook (Cargo/Categoria/Semana/
// Planejado/Real) — não valida o texto do cabeçalho, só pula a linha 0.
export function parseHistogramaLinhas(linhas: LinhaTabela[]): ResultadoParseHistograma {
  const problemas: Problema[] = []
  const resultado: LinhaImportada[] = []
  if (linhas.length === 0) return { linhas: resultado, problemas }

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i]!
    if (linha.every((c) => c.trim() === '')) continue
    const [cargoNome, categoriaTexto, semanaTexto, planejadoTexto, realTexto] = linha

    if (!cargoNome?.trim()) {
      problemas.push({ linha: i + 1, campo: 'Cargo', descricao: 'Cargo em branco — linha ignorada.' })
      continue
    }
    const semanaIso = semanaTexto ? parseDataBR(semanaTexto) : null
    if (!semanaIso) {
      problemas.push({ linha: i + 1, campo: 'Semana', descricao: `Data "${semanaTexto}" não reconhecida (esperado DD/MM/AAAA) — linha ignorada.` })
      continue
    }

    resultado.push({
      linha: i + 1,
      cargoNome: cargoNome.trim(),
      categoria: categoriaTexto ? categoriaDeTexto(categoriaTexto) : null,
      semanaIso,
      planejado: planejadoTexto ? parseNumero(planejadoTexto) : null,
      real: realTexto ? parseNumero(realTexto) : null,
    })
  }
  return { linhas: resultado, problemas }
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
  cargosExistentes: Cargo[]
  linhas: LinhaImportada[]
}): Promise<ResumoImportacaoHistograma> {
  const { projetoId, baselineAtivaId, cargosExistentes, linhas } = params

  const cargoPorNome = new Map(cargosExistentes.map((c) => [normalizarNomeCargo(c.nome), c]))
  const nomesNovos = new Map<string, { nome: string; categoria: Categoria | null }>()
  for (const l of linhas) {
    const chave = normalizarNomeCargo(l.cargoNome)
    if (!cargoPorNome.has(chave) && !nomesNovos.has(chave)) nomesNovos.set(chave, { nome: l.cargoNome, categoria: l.categoria })
  }

  if (nomesNovos.size > 0) {
    const { data, error } = await supabase
      .from('histograma_cargos')
      .insert([...nomesNovos.values()].map((c) => ({ projeto_id: projetoId, nome: c.nome, categoria: c.categoria, tipo: 'MO' })))
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
