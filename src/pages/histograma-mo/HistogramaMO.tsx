import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts'
import {
  Plus, CalendarClock, Table2, X, LineChart as LineChartIcon,
  Upload, Download, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2,
  Users, Wrench, Eraser, Trash2, Merge,
} from 'lucide-react'
import { toast } from 'sonner'
import { useProjects } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { toISODateStr, parseISODateStr, startOfWeek, addDays, formatShortDate, getISOWeekYearAndNumber } from '@/lib/iso-week'
import { lerArquivoComoLinhas } from '@/lib/administracao/parse-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import {
  type Categoria,
  contarCadastroAtivoPorCargo,
  criarBaseline,
  criarCargo,
  deleteBaseline,
  listBaselines,
  listCargos,
  listFuncoesAdministracao,
  listPlanejado,
  listRealSemanal,
  normalizarNomeCargo,
  upsertPlanejado,
  upsertReal,
  zerarValoresHistograma,
} from './lib/histograma-db'
import {
  buildHistogramaWorkbook,
  downloadHistogramaWorkbook,
  importarHistograma,
  parseHistogramaLinhas,
  type ResultadoParseHistograma,
} from './lib/excel'
import MesclarCargosDialog from './MesclarCargosDialog'

const CATEGORIA_OPCOES: { value: Categoria; label: string }[] = [
  { value: 'D', label: 'D — Direta (MOD)' },
  { value: 'I', label: 'I — Indireta (MOI)' },
]
const CATEGORIA_GRUPO_LABEL: Record<'D' | 'I' | 'SEM', string> = {
  D: 'Direta (MOD)',
  I: 'Indireta (MOI)',
  SEM: 'Sem categoria',
}
const TIPO_OPCOES: { value: 'MO' | 'EQUIPAMENTO'; label: string; icon: typeof Users }[] = [
  { value: 'MO', label: 'Pessoas', icon: Users },
  { value: 'EQUIPAMENTO', label: 'Equipamentos', icon: Wrench },
]

const DEBOUNCE_MS = 500
// Sexta-feira (0=Dom..6=Sáb) — mesmo weekStartDay padrão usado na Curva S
// (curve-utils.ts/SCurve.tsx, default 5 quando o cronograma não define o próprio) e
// na Programação Semanal (convenção Sex→Qui, ver iso-week.ts). O Histograma usava
// 4 (quinta) aqui antes, um dia adiantado — as semanas batiam entre si dentro do
// Histograma, mas ficavam desalinhadas 1 dia contra a Curva S/Programação.
const WEEK_START_DAY = 5
// Jornada padrão CLT (44h semanais) — usada só como multiplicador pra converter o
// efetivo (Qtd de pessoas) já lançado em Planejado/Real em horas-homem, pra Curva
// de Horas. Editável na própria aba, não é uma verdade fixa do sistema.
const HORAS_SEMANAIS_PADRAO = 44
// Altura fixa (px) das linhas da grade semanal — Cargo/Total ficam num painel à
// parte, fora do scroll horizontal (ver comentário acima de "Lançamento semanal"),
// então as alturas dos dois painéis precisam bater exatamente, senão as linhas
// desalinham visualmente entre os dois. HEADER_ROW_H cobre as camadas Ano/Mês;
// HEADER_WEEK_ROW_H cobre a última linha (número da semana + data, 2 textos
// empilhados na mesma célula); DATA_ROW_H cobre Planejado e Real.
const HEADER_ROW_H = 22
const HEADER_WEEK_ROW_H = 34
const DATA_ROW_H = 44

interface Semana {
  iso: string
  label: string
  monthKey: string
  monthLabel: string
  /** Nome do mês por extenso ("março") — cabeçalho da grade semanal (2ª camada,
   * entre Ano e Semana), separado de monthLabel (abreviado, usado na Visão mensal). */
  monthFullLabel: string
  ano: string
  /** Ano/número da semana ISO (weekStartDay=Sexta) — mesmo cálculo/rótulo "AAAA-ww"
   * de formatAxisTick (curve-utils.ts), usado na Curva S. */
  isoWeek: number
  isoYear: number
}

function gerarSemanas(inicioISO: string, fimISO: string): Semana[] {
  if (!inicioISO || !fimISO) return []
  const fim = parseISODateStr(fimISO.slice(0, 10))
  let cursor = startOfWeek(parseISODateStr(inicioISO.slice(0, 10)), WEEK_START_DAY)
  const semanas: Semana[] = []
  let guard = 0
  while (cursor <= fim && guard < 520) {
    semanas.push({
      iso: toISODateStr(cursor),
      label: formatShortDate(cursor).slice(0, 5),
      monthKey: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
      monthFullLabel: cursor.toLocaleDateString('pt-BR', { month: 'long' }),
      ano: String(cursor.getFullYear()),
      isoWeek: getISOWeekYearAndNumber(cursor, WEEK_START_DAY).week,
      isoYear: getISOWeekYearAndNumber(cursor, WEEK_START_DAY).year,
    })
    cursor = addDays(cursor, 7)
    guard++
  }
  return semanas
}

// Agrupa semanas consecutivas do mesmo mês (ou ano) numa faixa colSpan — cabeçalho
// de 3 camadas da grade semanal (Ano / Mês / Semana), igual a um cabeçalho de
// cronograma/Gantt. `semanas` já vem em ordem cronológica (gerarSemanas), então
// meses/anos iguais sempre ficam adjacentes — não precisa reordenar nada aqui.
function agruparPorColSpan(semanas: Semana[], chave: 'monthKey' | 'ano', label: 'monthFullLabel' | 'ano'): { chave: string; label: string; colSpan: number }[] {
  const grupos: { chave: string; label: string; colSpan: number }[] = []
  for (const s of semanas) {
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.chave === s[chave]) ultimo.colSpan++
    else grupos.push({ chave: s[chave], label: s[label], colSpan: 1 })
  }
  return grupos
}

function useDebouncedSave(delay = DEBOUNCE_MS) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const map = timers.current
    return () => map.forEach((t) => clearTimeout(t))
  }, [])
  return useCallback(
    (key: string, fn: () => void) => {
      const existing = timers.current.get(key)
      if (existing) clearTimeout(existing)
      timers.current.set(key, setTimeout(fn, delay))
    },
    [delay],
  )
}

function corAderencia(pct: number): string {
  if (pct >= 90) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export default function HistogramaMO() {
  const { currentProject } = useProjects()
  const { userProfile } = useAuth()
  const podeEditarPlano = !!userProfile?.is_super_admin || userProfile?.papel === 'edicao'
  const podeEditarReal = podeEditarPlano || userProfile?.papel === 'insercao_pontual'
  const projetoId = currentProject?.id
  const qc = useQueryClient()
  const schedule = useDebouncedSave()

  const [tipoAtivo, setTipoAtivo] = useState<'MO' | 'EQUIPAMENTO'>('MO')
  const [baselineId, setBaselineId] = useState<string | null>(null)
  const [aba, setAba] = useState<'semanal' | 'mensal' | 'horas'>('semanal')
  const [horasSemanais, setHorasSemanais] = useState(HORAS_SEMANAIS_PADRAO)
  const [cargoSelecionado, setCargoSelecionado] = useState<string>('__total__')
  const [modalBaselineAberto, setModalBaselineAberto] = useState(false)
  const [motivoNovaBaseline, setMotivoNovaBaseline] = useState('')
  const [novoCargoAberto, setNovoCargoAberto] = useState(false)
  const [novoCargo, setNovoCargo] = useState<{ nome: string; categoria: Categoria | null }>({ nome: '', categoria: null })
  const [funcaoBuscada, setFuncaoBuscada] = useState<string | null>(null)
  const [importAberto, setImportAberto] = useState(false)
  const [showMesclarCargos, setShowMesclarCargos] = useState(false)
  const [importArquivoNome, setImportArquivoNome] = useState('')
  const [importResultado, setImportResultado] = useState<ResultadoParseHistograma | null>(null)
  const [importResumo, setImportResumo] = useState<{ cargosCriados: number; valoresPlanejadoGravados: number; valoresRealGravados: number } | null>(null)
  const [importProcessando, setImportProcessando] = useState(false)
  const [importGravando, setImportGravando] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  const semanas = useMemo(
    () => gerarSemanas(currentProject?.dataInicio ?? '', currentProject?.dataFimPrevista ?? ''),
    [currentProject?.dataInicio, currentProject?.dataFimPrevista],
  )

  // Cabeçalho de 3 camadas da grade semanal (Lançamento semanal): Ano / Mês / Semana.
  const anosHeader = useMemo(() => agruparPorColSpan(semanas, 'ano', 'ano'), [semanas])
  const mesesHeader = useMemo(() => agruparPorColSpan(semanas, 'monthKey', 'monthFullLabel'), [semanas])

  const meses = useMemo(() => {
    const vistos = new Set<string>()
    const lista: { key: string; label: string; mes: string }[] = []
    for (const s of semanas) {
      if (vistos.has(s.monthKey)) continue
      vistos.add(s.monthKey)
      lista.push({ key: s.monthKey, label: s.monthLabel, mes: `${s.monthKey}-01` })
    }
    return lista
  }, [semanas])

  const semanaAtualIso = useMemo(() => toISODateStr(startOfWeek(new Date(), WEEK_START_DAY)), [])
  const semanaAtualVisivel = useMemo(() => semanas.some((s) => s.iso === semanaAtualIso), [semanas, semanaAtualIso])

  const { data: cargos = [] } = useQuery({
    queryKey: ['histograma-cargos', projetoId],
    queryFn: () => listCargos(projetoId!),
    enabled: !!projetoId,
  })

  const cargosVisiveis = useMemo(() => cargos.filter((c) => c.tipo === tipoAtivo), [cargos, tipoAtivo])

  function handleTrocarTipo(tipo: 'MO' | 'EQUIPAMENTO') {
    setTipoAtivo(tipo)
    setCargoSelecionado('__total__')
  }

  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const { data: cadastroPorCargo } = useQuery({
    queryKey: ['histograma-cadastro-ref', projetoId, organizacaoId],
    queryFn: () => contarCadastroAtivoPorCargo(projetoId!, organizacaoId!),
    enabled: !!projetoId && !!organizacaoId && tipoAtivo === 'MO',
  })

  const { data: funcoesAdministracao = [] } = useQuery({
    queryKey: ['histograma-funcoes-administracao', organizacaoId],
    queryFn: () => listFuncoesAdministracao(organizacaoId!),
    enabled: !!organizacaoId && tipoAtivo === 'MO',
  })

  // Nome-base normalizado -> categoria, do cadastro de Funções em Administração —
  // usado na importação pra herdar Direta/Indireta de um cargo novo cuja planilha
  // não informou categoria, em vez de sempre cair em "Sem categoria" (ver
  // importarHistograma em lib/excel.ts).
  const categoriaPorFuncaoAdministracao = useMemo(() => {
    const map = new Map<string, Categoria | null>()
    for (const f of funcoesAdministracao) map.set(normalizarNomeCargo(f.nome), f.categoria)
    return map
  }, [funcoesAdministracao])

  const { data: baselines = [] } = useQuery({
    queryKey: ['histograma-baselines', projetoId],
    queryFn: () => listBaselines(projetoId!),
    enabled: !!projetoId,
  })

  const baselineAtiva = useMemo(
    () => baselines.find((b) => b.id === baselineId) ?? baselines.find((b) => b.ativa) ?? baselines[0] ?? null,
    [baselines, baselineId],
  )

  useEffect(() => {
    if (baselineAtiva && baselineAtiva.id !== baselineId) setBaselineId(baselineAtiva.id)
  }, [baselineAtiva, baselineId])

  const { data: planejado = [] } = useQuery({
    queryKey: ['histograma-planejado', baselineAtiva?.id],
    queryFn: () => listPlanejado(baselineAtiva!.id),
    enabled: !!baselineAtiva?.id,
  })

  const { data: realSemanal = [] } = useQuery({
    queryKey: ['histograma-real', projetoId],
    queryFn: () => listRealSemanal(projetoId!),
    enabled: !!projetoId,
  })

  const [realEdits, setRealEdits] = useState<Record<string, number>>({})
  const [planejadoEdits, setPlanejadoEdits] = useState<Record<string, number>>({})

  const planejadoMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of planejado) map.set(`${p.cargo_id}__${p.semana_ref}`, p.qtd_planejada)
    return map
  }, [planejado])

  const realMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of realSemanal) map.set(`${r.cargo_id}__${r.semana_ref}`, r.qtd_real)
    return map
  }, [realSemanal])

  const upsertRealMut = useMutation({
    mutationFn: ({ cargoId, semanaIso, valor }: { cargoId: string; semanaIso: string; valor: number }) =>
      upsertReal(projetoId!, cargoId, semanaIso, valor),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['histograma-real', projetoId] })
      setRealEdits((prev) => {
        const next = { ...prev }
        delete next[`${vars.cargoId}__${vars.semanaIso}`]
        return next
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const upsertPlanejadoMut = useMutation({
    mutationFn: ({ cargoId, semanaIso, valor }: { cargoId: string; semanaIso: string; valor: number }) =>
      upsertPlanejado(baselineAtiva!.id, cargoId, semanaIso, valor),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['histograma-planejado', baselineAtiva?.id] })
      setPlanejadoEdits((prev) => {
        const next = { ...prev }
        delete next[`${vars.cargoId}__${vars.semanaIso}`]
        return next
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const criarBaselineMut = useMutation({
    mutationFn: () => criarBaseline(projetoId!, baselineAtiva?.id ?? null, motivoNovaBaseline),
    onSuccess: (nova) => {
      toast.success(`Baseline ${nova.versao} criada`)
      qc.invalidateQueries({ queryKey: ['histograma-baselines', projetoId] })
      setBaselineId(nova.id)
      setModalBaselineAberto(false)
      setMotivoNovaBaseline('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteBaselineMut = useMutation({
    mutationFn: (id: string) => deleteBaseline(id),
    onSuccess: (_data, id) => {
      toast.success('Baseline excluída')
      // Se a excluída era a que estava selecionada, limpa pra próxima leitura
      // recair sozinha na ativa (ou na primeira) da lista já sem ela — ver
      // baselineAtiva useMemo, que já trata baselineId apontando pra algo
      // que não existe mais.
      if (baselineId === id) setBaselineId(null)
      qc.invalidateQueries({ queryKey: ['histograma-baselines', projetoId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleExcluirBaseline() {
    if (!baselineAtiva) return
    if (
      !confirm(
        `Excluir a baseline ${baselineAtiva.versao}? Todo o Planejado gravado nela se perde — os cargos e o Real apontado continuam intactos. Essa ação não pode ser desfeita.`,
      )
    )
      return
    deleteBaselineMut.mutate(baselineAtiva.id)
  }

  const zerarValoresMut = useMutation({
    mutationFn: () => zerarValoresHistograma(projetoId!, baselineAtiva!.id),
    onSuccess: () => {
      toast.success('Valores zerados')
      setRealEdits({})
      setPlanejadoEdits({})
      qc.invalidateQueries({ queryKey: ['histograma-planejado', baselineAtiva?.id] })
      qc.invalidateQueries({ queryKey: ['histograma-real', projetoId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleZerarValores() {
    if (!confirm('Zerar TODOS os valores de Planejado (baseline ativa) e Real (todas as semanas, Pessoas e Equipamentos) deste projeto? Os cargos e as baselines cadastradas continuam intactos. Essa ação não pode ser desfeita.')) return
    zerarValoresMut.mutate()
  }

  const criarCargoMut = useMutation({
    mutationFn: () => criarCargo(projetoId!, novoCargo.nome.trim(), novoCargo.categoria, tipoAtivo),
    onSuccess: () => {
      toast.success('Cargo adicionado')
      qc.invalidateQueries({ queryKey: ['histograma-cargos', projetoId] })
      setNovoCargoAberto(false)
      setNovoCargo({ nome: '', categoria: null })
      setFuncaoBuscada(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleRealChange(cargoId: string, semanaIso: string, valor: string) {
    const num = valor === '' ? 0 : Number(valor)
    if (Number.isNaN(num)) return
    const key = `${cargoId}__${semanaIso}`
    setRealEdits((prev) => ({ ...prev, [key]: num }))
    schedule(`real:${key}`, () => upsertRealMut.mutate({ cargoId, semanaIso, valor: num }))
  }

  // Aplica em massa, pra semana atual, o mesmo valor que o link "Cadastro: N" já
  // oferece cargo a cargo — em vez de clicar um por um, preenche de uma vez todos
  // os cargos que batem por nome com o Controle de Funcionários (Administração).
  // Cargo sem correspondência (nome não bate) fica como estava, sem apagar nada.
  function handlePreencherComCadastro() {
    if (!cadastroPorCargo || cadastroPorCargo.size === 0) {
      toast.warning('Nenhum funcionário cadastrado e ativo casou com os cargos deste projeto no Controle de Funcionários.')
      return
    }
    let preenchidos = 0
    for (const cargo of cargosVisiveis) {
      const referencia = cadastroPorCargo.get(normalizarNomeCargo(cargo.nome))
      if (referencia === undefined) continue
      handleRealChange(cargo.id, semanaAtualIso, String(referencia))
      preenchidos++
    }
    if (preenchidos === 0) {
      toast.warning('Nenhum cargo desta lista bate com um nome de cargo do Controle de Funcionários.')
      return
    }
    toast.success(`${preenchidos} cargo(s) preenchido(s) na semana atual`)
  }

  function handlePlanejadoChange(cargoId: string, semanaIso: string, valor: string) {
    const num = valor === '' ? 0 : Number(valor)
    if (Number.isNaN(num)) return
    const key = `${cargoId}__${semanaIso}`
    setPlanejadoEdits((prev) => ({ ...prev, [key]: num }))
    schedule(`planejado:${key}`, () => upsertPlanejadoMut.mutate({ cargoId, semanaIso, valor: num }))
  }

  async function handleExportar() {
    try {
      const wb = await buildHistogramaWorkbook(cargosVisiveis, semanas, planejadoMap, realMap)
      await downloadHistogramaWorkbook(wb)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportArquivoNome(file.name)
    setImportResultado(null)
    setImportResumo(null)
    setImportProcessando(true)
    try {
      const linhas = await lerArquivoComoLinhas(file)
      setImportResultado(parseHistogramaLinhas(linhas))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImportProcessando(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  // Nomes da planilha que NÃO batem com nenhum cargo já cadastrado (mesma
  // comparação normalizada que importarHistograma usa pra decidir se cria um cargo
  // novo) — mostrado ANTES de confirmar, porque hoje esse "cargo novo" só aparecia
  // como uma contagem no resumo de DEPOIS ("N cargo(s) novo(s)"), fácil de não
  // notar. Se um cargo da planilha na verdade já existe só que com um nome digitado
  // um pouco diferente (plural, abreviação, "de Obras" a mais/a menos), a
  // importação cria um cargo DUPLICADO em vez de atualizar o existente — os valores
  // são gravados nesse duplicado (que cai em "Sem categoria", separado de onde o
  // cargo original está), dando a impressão de que "não carregou".
  const cargosNovosNaImportacao = useMemo(() => {
    if (!importResultado) return []
    const existentes = new Set(cargosVisiveis.map((c) => normalizarNomeCargo(c.nome)))
    const vistos = new Set<string>()
    const novos: string[] = []
    for (const linha of importResultado.linhas) {
      const chave = normalizarNomeCargo(linha.cargoNome)
      if (existentes.has(chave) || vistos.has(chave)) continue
      vistos.add(chave)
      novos.push(linha.cargoNome)
    }
    return novos
  }, [importResultado, cargosVisiveis])

  async function handleConfirmarImport() {
    if (!importResultado || !projetoId) return
    setImportGravando(true)
    try {
      // importarHistograma só grava Planejado se houver baseline_id (a tabela
      // histograma_planejado exige) — sem essa criação automática, importar uma
      // planilha num projeto que ainda não tem nenhuma baseline (LB0) descartava
      // TODO o Planejado da planilha em silêncio, gravando só o Real. O resumo
      // até mostrava "0 valor(es) de planejado gravado(s)", mas fácil de não
      // reparar no meio da lista — daí a sensação de "a importação não carregou
      // todas as informações".
      let baselineIdParaImportar = baselineAtiva?.id ?? null
      if (!baselineIdParaImportar) {
        const novaBaseline = await criarBaseline(projetoId, null, 'Criada automaticamente pela importação de planilha (nenhuma baseline existia ainda)')
        baselineIdParaImportar = novaBaseline.id
        setBaselineId(novaBaseline.id)
        qc.invalidateQueries({ queryKey: ['histograma-baselines', projetoId] })
      }
      const resumo = await importarHistograma({
        projetoId,
        baselineAtivaId: baselineIdParaImportar,
        tipo: tipoAtivo,
        cargosExistentes: cargosVisiveis,
        linhas: importResultado.linhas,
        categoriaPorFuncao: categoriaPorFuncaoAdministracao,
      })
      setImportResumo(resumo)
      qc.invalidateQueries({ queryKey: ['histograma-cargos', projetoId] })
      qc.invalidateQueries({ queryKey: ['histograma-planejado', baselineIdParaImportar] })
      qc.invalidateQueries({ queryKey: ['histograma-real', projetoId] })
      toast.success('Importação concluída')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImportGravando(false)
    }
  }

  function fecharImport() {
    setImportAberto(false)
    setImportArquivoNome('')
    setImportResultado(null)
    setImportResumo(null)
  }

  // Planejado x real por cargo e por mês — agregado no cliente (média das semanas
  // do mês, mesmo critério pros dois agora que Planejado também é semanal), em vez
  // de uma VIEW no banco: as views do Postgres rodam com o contexto de permissão do
  // dono por padrão, e este projeto não tem nenhum padrão estabelecido de view
  // multi-tenant segura (os únicos 2 exemplos existentes são telas de admin, não
  // dado por organização) — agregar aqui evita esse risco.
  // Planejado sempre teve um valor (0 por padrão, nunca "sem lançamento") — por
  // isso a média usa TODAS as semanas do mês. Real só conta as semanas que
  // realmente têm apontamento (undefined fica de fora, ver semanasApontadas).
  const mensalPorCargo = useMemo(() => {
    const resultado = new Map<string, { monthKey: string; monthLabel: string; planejado: number; real: number | null; semanasApontadas: number; semanasTotais: number }[]>()
    for (const cargo of cargosVisiveis) {
      const linhas = meses.map((m) => {
        const semanasDoMes = semanas.filter((s) => s.monthKey === m.key)
        const valoresPlanejados = semanasDoMes.map((s) => planejadoEdits[`${cargo.id}__${s.iso}`] ?? planejadoMap.get(`${cargo.id}__${s.iso}`) ?? 0)
        const planejadoVal = valoresPlanejados.length > 0 ? valoresPlanejados.reduce((a, b) => a + b, 0) / valoresPlanejados.length : 0
        const valoresReais = semanasDoMes
          .map((s) => realEdits[`${cargo.id}__${s.iso}`] ?? realMap.get(`${cargo.id}__${s.iso}`))
          .filter((v): v is number => v !== undefined)
        const real = valoresReais.length > 0 ? valoresReais.reduce((a, b) => a + b, 0) / valoresReais.length : null
        return {
          monthKey: m.key,
          monthLabel: m.label,
          planejado: planejadoVal,
          real,
          semanasApontadas: valoresReais.length,
          semanasTotais: semanasDoMes.length,
        }
      })
      resultado.set(cargo.id, linhas)
    }
    return resultado
  }, [cargosVisiveis, meses, semanas, planejadoMap, realMap, planejadoEdits, realEdits])

  const cargosPorCategoria = useMemo(() => {
    const grupos: Record<'D' | 'I' | 'SEM', typeof cargosVisiveis> = { D: [], I: [], SEM: [] }
    for (const cargo of cargosVisiveis) grupos[cargo.categoria ?? 'SEM'].push(cargo)
    return (['D', 'I', 'SEM'] as const).map((chave) => ({ chave, cargos: grupos[chave] })).filter((g) => g.cargos.length > 0)
  }, [cargosVisiveis])

  const dadosGrafico = useMemo(() => {
    if (cargoSelecionado === '__total__') {
      return meses.map((m) => {
        let planejado = 0
        let real = 0
        let temReal = false
        for (const cargo of cargosVisiveis) {
          const linha = mensalPorCargo.get(cargo.id)?.find((l) => l.monthKey === m.key)
          if (!linha) continue
          planejado += linha.planejado
          if (linha.real !== null) {
            real += linha.real
            temReal = true
          }
        }
        return { mes: m.label, Planejado: Math.round(planejado), Real: temReal ? Math.round(real) : null }
      })
    }
    const linhas = mensalPorCargo.get(cargoSelecionado) ?? []
    return linhas.map((l) => ({ mes: l.monthLabel, Planejado: Math.round(l.planejado), Real: l.real !== null ? Math.round(l.real) : null }))
  }, [cargoSelecionado, cargosVisiveis, mensalPorCargo, meses])

  // Total do período (soma, não média) por cargo — soma o valor de cada semana
  // lançada, Planejado e Real do mesmo jeito agora que os dois são semanais. Existe
  // pra responder "quanto desse cargo foi usado/apontado no projeto inteiro", que
  // mensalPorCargo não responde de jeito nenhum (ali é média por mês, feita pro
  // gráfico, não soma do período todo).
  const totaisPorCargo = useMemo(() => {
    const map = new Map<string, { planejado: number; real: number }>()
    for (const cargo of cargosVisiveis) {
      let planejado = 0
      let real = 0
      for (const s of semanas) {
        planejado += planejadoEdits[`${cargo.id}__${s.iso}`] ?? planejadoMap.get(`${cargo.id}__${s.iso}`) ?? 0
        real += realEdits[`${cargo.id}__${s.iso}`] ?? realMap.get(`${cargo.id}__${s.iso}`) ?? 0
      }
      map.set(cargo.id, { planejado, real })
    }
    return map
  }, [cargosVisiveis, semanas, planejadoEdits, planejadoMap, realEdits, realMap])

  // Curva de Horas (HH) — só Pessoas (MO): equipamento não vira "hora-homem" da
  // mesma forma, e "horas do projeto" nesse sentido é sempre mão de obra. Converte
  // o efetivo já lançado (Qtd de pessoas por semana) em horas via horasSemanais, e
  // acumula mês a mês — a curva S sai da própria acumulação (poucas horas no
  // início/fim da obra, pico no meio), não de uma fórmula pronta. Planejado e Real
  // são os dois por semana, somam direto.
  const cargosMO = useMemo(() => cargos.filter((c) => c.tipo === 'MO'), [cargos])
  const curvaHoras = useMemo(() => {
    let acumPlanejado = 0
    let acumReal = 0
    let temReal = false
    return meses.map((m) => {
      const semanasDoMes = semanas.filter((s) => s.monthKey === m.key)
      let planejadoMes = 0
      let realMes = 0
      let semanasComReal = 0
      for (const cargo of cargosMO) {
        for (const s of semanasDoMes) {
          const qtdPlanejada = planejadoEdits[`${cargo.id}__${s.iso}`] ?? planejadoMap.get(`${cargo.id}__${s.iso}`) ?? 0
          planejadoMes += qtdPlanejada * horasSemanais
          const v = realEdits[`${cargo.id}__${s.iso}`] ?? realMap.get(`${cargo.id}__${s.iso}`)
          if (v !== undefined) {
            realMes += v * horasSemanais
            semanasComReal++
          }
        }
      }
      acumPlanejado += planejadoMes
      if (semanasComReal > 0) {
        acumReal += realMes
        temReal = true
      }
      return { mes: m.label, Planejado: Math.round(acumPlanejado), Real: temReal ? Math.round(acumReal) : null }
    })
  }, [cargosMO, meses, semanas, planejadoEdits, planejadoMap, realEdits, realMap, horasSemanais])

  const horasPlanejadasTotais = curvaHoras.at(-1)?.Planejado ?? 0
  const horasReaisTotais = curvaHoras.at(-1)?.Real ?? 0
  const aderenciaHoras = horasPlanejadasTotais > 0 && curvaHoras.some((p) => p.Real !== null)
    ? (horasReaisTotais / horasPlanejadasTotais) * 100
    : null

  const cargoOptions = useMemo(
    () => [
      { value: '__total__', label: 'Total (todos os cargos)' },
      ...cargosVisiveis.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [cargosVisiveis],
  )

  const baselineOptions = useMemo(
    () => baselines.map((b) => ({ value: b.id, label: `${b.versao}${b.descricao ? ` — ${b.descricao}` : ''}` })),
    [baselines],
  )

  if (!currentProject) {
    return <div className="p-6 text-muted-foreground">Selecione um projeto para ver o Histograma.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChartIcon className="h-6 w-6 text-primary" /> Histograma
          </h1>
          <p className="text-sm text-muted-foreground">Planejado por baseline e apontamento real semanal, por pessoas ou equipamentos.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-64">
            <Combobox options={baselineOptions} value={baselineId} onChange={(v) => v && setBaselineId(v)} placeholder="Baseline" allowClear={false} />
          </div>
          {podeEditarPlano && (
            <Button variant="outline" onClick={() => setModalBaselineAberto(true)}>
              <CalendarClock className="h-4 w-4" /> Nova revisão
            </Button>
          )}
          {podeEditarPlano && baselineAtiva && (
            <Button
              variant="outline"
              className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={handleExcluirBaseline}
              disabled={deleteBaselineMut.isPending}
              title={`Exclui a baseline ${baselineAtiva.versao} e todo o Planejado gravado nela — cargos e Real continuam intactos`}
            >
              {deleteBaselineMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir baseline
            </Button>
          )}
          {podeEditarPlano && baselineAtiva && (
            <Button
              variant="outline"
              className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={handleZerarValores}
              disabled={zerarValoresMut.isPending}
              title="Apaga os valores de Planejado (baseline ativa) e Real (todas as semanas) — cargos e baselines continuam cadastrados"
            >
              {zerarValoresMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />} Zerar valores
            </Button>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-input p-1 bg-muted/30">
        {TIPO_OPCOES.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => handleTrocarTipo(o.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tipoAtivo === o.value ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <o.icon className="h-4 w-4" /> {o.label}
          </button>
        ))}
      </div>

      {baselineAtiva && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-amber-800 dark:text-amber-300">Baseline ativa: {baselineAtiva.versao}</span>
            {baselineAtiva.motivo && <span className="text-amber-700 dark:text-amber-400">Motivo: {baselineAtiva.motivo}</span>}
            {baselineAtiva.aprovado_por && <span className="text-amber-700 dark:text-amber-400">Aprovado por: {baselineAtiva.aprovado_por}</span>}
          </CardContent>
        </Card>
      )}

      {!baselineAtiva && podeEditarPlano && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Nenhuma baseline cadastrada ainda para este projeto. Clique em "Nova revisão" para criar a primeira (LB0).
          </CardContent>
        </Card>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(v as 'semanal' | 'mensal' | 'horas')}>
        <TabsList>
          <TabsTrigger value="semanal">Lançamento semanal</TabsTrigger>
          <TabsTrigger value="mensal"><Table2 className="h-4 w-4" /> Visão mensal</TabsTrigger>
          <TabsTrigger value="horas"><LineChartIcon className="h-4 w-4" /> Curva de Horas</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Cada cargo tem duas linhas, uma pra cada semana: <span className="text-blue-600 dark:text-blue-400 font-medium">Planejado</span> e{' '}
            <span className="text-red-600 dark:text-red-400 font-medium">Real</span>. Os valores salvam sozinhos ~0,5s depois de parar de digitar.
            {tipoAtivo === 'MO' && (
              <> Na semana atual, quando o cargo bate com um cargo do Controle de Funcionários (Administração), aparece "Cadastro: N" com
              o total de funcionários ativos daquele cargo vinculados a este projeto — clique pra usar esse número no Real.</>
            )}
            {' '}Os cargos são agrupados por categoria — Direta (MOD) e Indireta (MOI).
          </p>

          <div className="flex justify-end gap-2">
            {tipoAtivo === 'MO' && podeEditarReal && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreencherComCadastro}
                disabled={!semanaAtualVisivel}
                title={semanaAtualVisivel ? 'Preenche o Real da semana atual com o total de funcionários ativos de cada cargo (Controle de Funcionários)' : 'A semana atual está fora do período do projeto'}
              >
                <Users className="h-4 w-4" /> Preencher semana atual (Cadastro)
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleExportar} disabled={cargosVisiveis.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            {podeEditarPlano && (
              <Button size="sm" variant="outline" onClick={() => setImportAberto(true)}>
                <Upload className="h-4 w-4" /> Importar
              </Button>
            )}
            {podeEditarPlano && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowMesclarCargos(true)}
                disabled={cargosVisiveis.length < 2}
                title="Corrige um cargo duplicado — junta os valores de dois cargos num só"
              >
                <Merge className="h-4 w-4" /> Mesclar cargos
              </Button>
            )}
          </div>

          {podeEditarPlano && (
            <div className="flex justify-end">
              {novoCargoAberto ? (
                <div className="flex items-end gap-2 flex-wrap">
                  {tipoAtivo === 'MO' && funcoesAdministracao.length > 0 && (
                    <div>
                      <Label className="text-xs">Buscar função (Administração)</Label>
                      <div className="w-48">
                        <Combobox
                          options={funcoesAdministracao.map((f) => ({ value: f.id, label: f.nome }))}
                          value={funcaoBuscada}
                          onChange={(v) => {
                            setFuncaoBuscada(v)
                            const f = funcoesAdministracao.find((x) => x.id === v)
                            if (f) setNovoCargo({ nome: f.nome, categoria: f.categoria })
                          }}
                          placeholder="Buscar..."
                          className="h-8"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Cargo</Label>
                    <Input value={novoCargo.nome} onChange={(e) => setNovoCargo((p) => ({ ...p, nome: e.target.value }))} className="h-8 w-40" />
                  </div>
                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <select
                      className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm"
                      value={novoCargo.categoria ?? ''}
                      onChange={(e) => setNovoCargo((p) => ({ ...p, categoria: (e.target.value || null) as Categoria | null }))}
                    >
                      <option value="">—</option>
                      {CATEGORIA_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <Button size="sm" disabled={!novoCargo.nome || criarCargoMut.isPending} onClick={() => criarCargoMut.mutate()}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setNovoCargoAberto(false); setFuncaoBuscada(null) }}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setNovoCargoAberto(true)}><Plus className="h-4 w-4" /> Cargo</Button>
              )}
            </div>
          )}

          {semanas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Defina as datas de início e fim previsto do projeto para gerar as semanas do histograma.
            </p>
          )}

          {cargosVisiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum {tipoAtivo === 'MO' ? 'cargo de pessoas' : 'equipamento'} cadastrado ainda para este projeto.
            </p>
          )}

          {/* Painel Cargo/Total fica FORA do scroll horizontal (div própria, sem
              overflow) — só o painel das semanas rola. Antes, com as duas colunas
              "sticky" dentro do mesmo scroll da tabela, a barra de rolagem do
              navegador cobria a largura inteira (Cargo+Total+semanas), mesmo essas
              duas colunas não saindo do lugar visualmente — dava a impressão da
              barra "invadindo" a área do cargo. As alturas de linha são fixas
              (HEADER_ROW_H/DATA_ROW_H) pra alinhar as linhas entre os dois painéis. */}
          {semanas.length > 0 && cargosPorCategoria.map((grupo) => (
              <Card key={grupo.chave} className="overflow-hidden">
                <div className="px-4 py-2 bg-muted/50 font-semibold text-sm">{CATEGORIA_GRUPO_LABEL[grupo.chave]}</div>
                <CardContent className="p-0">
                  <div className="flex">
                    <div className="shrink-0 border-r border-border">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr className="border-b" style={{ height: HEADER_ROW_H * 2 + HEADER_WEEK_ROW_H }}>
                            <th className="text-left px-3 py-2 w-36 align-bottom">Cargo</th>
                            <th
                              className="text-center px-2 py-2 w-16 align-bottom"
                              title="Soma de todo o período — Planejado e Real somam cada semana lançada"
                            >
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.cargos.map((cargo) => {
                            const total = totaisPorCargo.get(cargo.id) ?? { planejado: 0, real: 0 }
                            return (
                              <Fragment key={cargo.id}>
                                <tr className="border-b border-border/50 bg-muted/40" style={{ height: DATA_ROW_H }}>
                                  <td className="px-3 py-1.5 w-36 truncate" title={cargo.nome}>
                                    <span className="font-medium">{cargo.nome}</span>
                                    <span className="block text-[10px] text-blue-600 dark:text-blue-400">Planejado (semana)</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-center font-semibold text-blue-600 dark:text-blue-400" title="Total planejado no período (soma das semanas)">
                                    {total.planejado}
                                  </td>
                                </tr>
                                <tr className="border-b" style={{ height: DATA_ROW_H }}>
                                  <td className="px-3 py-1.5 w-36 text-muted-foreground text-[11px] truncate" title={cargo.nome}>Real (semana)</td>
                                  <td className="px-2 py-1.5 text-center font-semibold text-red-600 dark:text-red-400" title="Total real apontado no período (soma das semanas)">
                                    {total.real}
                                  </td>
                                </tr>
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto flex-1">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/50" style={{ height: HEADER_ROW_H }}>
                            {anosHeader.map((a) => (
                              <th key={a.chave} colSpan={a.colSpan} className="px-2 text-center font-semibold text-muted-foreground border-l border-border/50">
                                {a.label}
                              </th>
                            ))}
                          </tr>
                          <tr className="border-b border-border/50" style={{ height: HEADER_ROW_H }}>
                            {mesesHeader.map((m) => (
                              <th key={m.chave} colSpan={m.colSpan} className="px-2 text-center font-medium text-muted-foreground capitalize border-l border-border/50">
                                {m.label}
                              </th>
                            ))}
                          </tr>
                          <tr className="border-b" style={{ height: HEADER_WEEK_ROW_H }}>
                            {semanas.map((s) => (
                              <th key={s.iso} className="px-2 text-center min-w-[64px] font-medium text-muted-foreground" title={`Semana ISO ${s.isoYear}-${String(s.isoWeek).padStart(2, '0')} — mesmo cálculo da Curva S`}>
                                <div className="text-[9px] font-normal text-muted-foreground/70">{s.isoYear}-{String(s.isoWeek).padStart(2, '0')}</div>
                                <div>{s.label}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.cargos.map((cargo) => {
                            return (
                              <Fragment key={cargo.id}>
                                <tr className="border-b border-border/50 bg-muted/40" style={{ height: DATA_ROW_H }}>
                                  {semanas.map((s) => {
                                    const key = `${cargo.id}__${s.iso}`
                                    const valor = planejadoEdits[key] ?? planejadoMap.get(key) ?? 0
                                    return (
                                      <td key={s.iso} className="px-1 py-1">
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          value={valor}
                                          disabled={!podeEditarPlano || !baselineAtiva}
                                          onChange={(e) => handlePlanejadoChange(cargo.id, s.iso, e.target.value)}
                                          className="w-14 rounded border border-input bg-background text-center text-blue-600 dark:text-blue-400 disabled:opacity-50"
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                                <tr className="border-b" style={{ height: DATA_ROW_H }}>
                                  {semanas.map((s) => {
                                    const key = `${cargo.id}__${s.iso}`
                                    const valor = realEdits[key] ?? realMap.get(key) ?? ''
                                    const referencia = tipoAtivo === 'MO' && s.iso === semanaAtualIso ? cadastroPorCargo?.get(normalizarNomeCargo(cargo.nome)) : undefined
                                    return (
                                      <td key={s.iso} className="px-1 py-1">
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          value={valor}
                                          disabled={!podeEditarReal}
                                          onChange={(e) => handleRealChange(cargo.id, s.iso, e.target.value)}
                                          className="w-14 rounded border border-input bg-background text-center text-red-600 dark:text-red-400 disabled:opacity-50"
                                        />
                                        {/* Espaço sempre reservado (mesmo sem sugestão) pra linha não mudar de
                                            altura conforme a semana/cargo — o painel Cargo/Total, numa tabela
                                            separada, não teria como "crescer junto" se essa altura variasse. */}
                                        <div className="h-3.5">
                                          {referencia !== undefined && (
                                            <button
                                              type="button"
                                              disabled={!podeEditarReal}
                                              title="Vem do Cadastro de Funcionários (Administração) — clique pra usar esse valor"
                                              onClick={() => handleRealChange(cargo.id, s.iso, String(referencia))}
                                              className="block w-full text-center text-[10px] text-muted-foreground hover:text-primary underline decoration-dotted disabled:pointer-events-none"
                                            >
                                              Cadastro: {referencia}
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    )
                                  })}
                                </tr>
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
          ))}
        </TabsContent>

        <TabsContent value="mensal" className="space-y-4">
          <div className="w-72">
            <Combobox options={cargoOptions} value={cargoSelecionado} onChange={(v) => setCargoSelecionado(v ?? '__total__')} allowClear={false} />
          </div>

          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={dadosGrafico} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Planejado" fill="#3b82f6">
                    <LabelList dataKey="Planejado" position="top" fontSize={11} />
                  </Bar>
                  <Bar dataKey="Real" fill="#ef4444">
                    <LabelList dataKey="Real" position="top" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {cargoSelecionado !== '__total__' && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2">Mês</th>
                      <th className="px-3 py-2">Planejado (média)</th>
                      <th className="px-3 py-2">Real (média)</th>
                      <th className="px-3 py-2">Aderência</th>
                      <th className="px-3 py-2">Semanas apontadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mensalPorCargo.get(cargoSelecionado) ?? []).map((l) => {
                      const pct = l.planejado > 0 && l.real !== null ? (l.real / l.planejado) * 100 : 0
                      return (
                        <tr key={l.monthKey} className="border-b">
                          <td className="px-3 py-1.5">{l.monthLabel}</td>
                          <td className="px-3 py-1.5 text-center">{l.planejado.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-center">{l.real !== null ? l.real.toFixed(1) : '—'}</td>
                          <td className={`px-3 py-1.5 text-center font-medium ${l.real !== null ? corAderencia(pct) : 'text-muted-foreground'}`}>
                            {l.real !== null ? `${pct.toFixed(0)}%` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-center text-muted-foreground">{l.semanasApontadas}/{l.semanasTotais}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="horas" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Curva S de horas-homem do projeto inteiro (só Pessoas — equipamento não entra aqui) — converte o efetivo já
            lançado em Planejado/Real (Qtd de pessoas por semana) em horas, usando a jornada semanal abaixo, e acumula
            mês a mês. É a mesma acumulação que forma o "S": poucas horas no início/fim da obra, pico no meio.
          </p>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Jornada semanal por pessoa (horas)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                value={horasSemanais}
                onChange={(e) => setHorasSemanais(Number(e.target.value) || 0)}
                className="w-32"
              />
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Horas planejadas (total)</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{horasPlanejadasTotais.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Horas reais (até agora)</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{horasReaisTotais.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Aderência</p>
                <p className={`text-lg font-bold ${aderenciaHoras !== null ? corAderencia(aderenciaHoras) : 'text-muted-foreground'}`}>
                  {aderenciaHoras !== null ? `${aderenciaHoras.toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={curvaHoras} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Planejado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Real" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={modalBaselineAberto} onOpenChange={setModalBaselineAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova revisão de baseline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cria uma nova baseline ({`LB${baselines.length}`}) copiando o planejado da baseline ativa atual como ponto de partida.
            </p>
            <div className="space-y-1.5">
              <Label>Motivo da revisão</Label>
              <Textarea value={motivoNovaBaseline} onChange={(e) => setMotivoNovaBaseline(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalBaselineAberto(false)}>Cancelar</Button>
            <Button onClick={() => criarBaselineMut.mutate()} disabled={criarBaselineMut.isPending}>
              {criarBaselineMut.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importAberto} onOpenChange={(o) => !o && fecharImport()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar planilha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Envie uma planilha XLSX/CSV no mesmo formato do "Exportar" (Cargo, Categoria, Linha "Planejado"/"Real" e uma coluna por semana).
              Vale pra {tipoAtivo === 'MO' ? 'Pessoas' : 'Equipamentos'} — cargos citados que ainda não existem no projeto são criados
              automaticamente; reimportar atualiza os valores já existentes.
            </p>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              className="hidden"
              disabled={importProcessando || importGravando}
            />
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              disabled={importProcessando || importGravando}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-input rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition disabled:cursor-not-allowed"
            >
              {importProcessando ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processando {importArquivoNome}...</>
              ) : importArquivoNome ? (
                <><FileSpreadsheet className="h-4 w-4 text-primary" /> {importArquivoNome}</>
              ) : (
                <><Upload className="h-4 w-4" /> Selecionar arquivo XLSX ou CSV</>
              )}
            </button>

            {importResultado && !importResumo && (
              <div className="rounded-lg border p-3 text-sm space-y-2">
                <p className="font-medium">
                  {importResultado.linhas.length} linha(s) prontas pra importar
                  {importResultado.problemas.length > 0 && ` · ${importResultado.problemas.length} aviso(s)`}
                </p>
                {cargosNovosNaImportacao.length > 0 && (
                  <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <p className="font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {cargosNovosNaImportacao.length} nome(s) da planilha não bateram com nenhum cargo já cadastrado — serão criados como cargo novo:
                    </p>
                    <p className="mt-1">{cargosNovosNaImportacao.join(', ')}</p>
                    <p className="mt-1">Se algum desses já existe no projeto com o nome escrito um pouco diferente, cancele e ajuste a planilha antes de confirmar — senão vira um cargo duplicado, com os valores separados do cargo original.</p>
                  </div>
                )}
                {importResultado.problemas.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {importResultado.problemas.map((p, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Linha {p.linha}{p.campo ? ` (${p.campo})` : ''}: {p.descricao}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {importResumo && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Importação concluída
                </p>
                <ul className="text-emerald-700 dark:text-emerald-400 space-y-0.5">
                  <li>{importResumo.cargosCriados} cargo(s) novo(s)</li>
                  <li>{importResumo.valoresPlanejadoGravados} valor(es) de planejado gravado(s)</li>
                  <li>{importResumo.valoresRealGravados} valor(es) de real gravado(s)</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={fecharImport}>{importResumo ? 'Fechar' : 'Cancelar'}</Button>
            {!importResumo && (
              <Button onClick={handleConfirmarImport} disabled={!importResultado || importResultado.linhas.length === 0 || importGravando}>
                {importGravando ? 'Importando...' : 'Confirmar importação'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showMesclarCargos && (
        <MesclarCargosDialog
          cargos={cargosVisiveis}
          onClose={() => setShowMesclarCargos(false)}
          onMesclado={() => {
            qc.invalidateQueries({ queryKey: ['histograma-cargos', projetoId] })
            qc.invalidateQueries({ queryKey: ['histograma-planejado'] })
            qc.invalidateQueries({ queryKey: ['histograma-real', projetoId] })
          }}
        />
      )}
    </div>
  )
}
