import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
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
} from 'lucide-react'
import { toast } from 'sonner'
import { useProjects } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { toISODateStr, parseISODateStr, startOfWeek, addDays, formatShortDate } from '@/lib/iso-week'
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
  listBaselines,
  listCargos,
  listFuncoesAdministracao,
  listPlanejado,
  listRealSemanal,
  normalizarNomeCargo,
  upsertPlanejado,
  upsertReal,
} from './lib/histograma-db'
import {
  buildHistogramaWorkbook,
  downloadHistogramaWorkbook,
  importarHistograma,
  parseHistogramaLinhas,
  type ResultadoParseHistograma,
} from './lib/excel'

const CATEGORIA_OPCOES: { value: Categoria; label: string }[] = [
  { value: 'D', label: 'D — Direta (MOD)' },
  { value: 'I', label: 'I — Indireta (MOI)' },
]
const CATEGORIA_GRUPO_LABEL: Record<'D' | 'I' | 'SEM', string> = {
  D: 'Direta (MOD)',
  I: 'Indireta (MOI)',
  SEM: 'Sem categoria',
}

const DEBOUNCE_MS = 500
const THURSDAY = 4 // 0=Dom..6=Sáb

interface Semana {
  iso: string
  label: string
  monthKey: string
  monthLabel: string
}

function gerarSemanas(inicioISO: string, fimISO: string): Semana[] {
  if (!inicioISO || !fimISO) return []
  const fim = parseISODateStr(fimISO.slice(0, 10))
  let cursor = startOfWeek(parseISODateStr(inicioISO.slice(0, 10)), THURSDAY)
  const semanas: Semana[] = []
  let guard = 0
  while (cursor <= fim && guard < 520) {
    semanas.push({
      iso: toISODateStr(cursor),
      label: formatShortDate(cursor).slice(0, 5),
      monthKey: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
    })
    cursor = addDays(cursor, 7)
    guard++
  }
  return semanas
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

  const [baselineId, setBaselineId] = useState<string | null>(null)
  const [aba, setAba] = useState<'semanal' | 'mensal'>('semanal')
  const [cargoSelecionado, setCargoSelecionado] = useState<string>('__total__')
  const [modalBaselineAberto, setModalBaselineAberto] = useState(false)
  const [motivoNovaBaseline, setMotivoNovaBaseline] = useState('')
  const [novoCargoAberto, setNovoCargoAberto] = useState(false)
  const [novoCargo, setNovoCargo] = useState<{ nome: string; categoria: Categoria | null }>({ nome: '', categoria: null })
  const [funcaoBuscada, setFuncaoBuscada] = useState<string | null>(null)
  const [importAberto, setImportAberto] = useState(false)
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

  const semanaAtualIso = useMemo(() => toISODateStr(startOfWeek(new Date(), THURSDAY)), [])

  const { data: cargos = [] } = useQuery({
    queryKey: ['histograma-cargos', projetoId],
    queryFn: () => listCargos(projetoId!),
    enabled: !!projetoId,
  })

  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const { data: cadastroPorCargo } = useQuery({
    queryKey: ['histograma-cadastro-ref', projetoId, organizacaoId],
    queryFn: () => contarCadastroAtivoPorCargo(projetoId!, organizacaoId!),
    enabled: !!projetoId && !!organizacaoId,
  })

  const { data: funcoesAdministracao = [] } = useQuery({
    queryKey: ['histograma-funcoes-administracao', organizacaoId],
    queryFn: () => listFuncoesAdministracao(organizacaoId!),
    enabled: !!organizacaoId,
  })

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
    for (const p of planejado) map.set(`${p.cargo_id}__${p.mes.slice(0, 7)}`, p.qtd_planejada)
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
    mutationFn: ({ cargoId, mes, valor }: { cargoId: string; mes: string; valor: number }) =>
      upsertPlanejado(baselineAtiva!.id, cargoId, mes, valor),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['histograma-planejado', baselineAtiva?.id] })
      setPlanejadoEdits((prev) => {
        const next = { ...prev }
        delete next[`${vars.cargoId}__${vars.mes.slice(0, 7)}`]
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

  const criarCargoMut = useMutation({
    mutationFn: () => criarCargo(projetoId!, novoCargo.nome.trim(), novoCargo.categoria, 'MO'),
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

  function handlePlanejadoChange(cargoId: string, mes: string, valor: string) {
    const num = valor === '' ? 0 : Number(valor)
    if (Number.isNaN(num)) return
    const key = `${cargoId}__${mes.slice(0, 7)}`
    setPlanejadoEdits((prev) => ({ ...prev, [key]: num }))
    schedule(`planejado:${key}`, () => upsertPlanejadoMut.mutate({ cargoId, mes, valor: num }))
  }

  async function handleExportar() {
    try {
      const wb = await buildHistogramaWorkbook(cargos, semanas, planejadoMap, realMap)
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

  async function handleConfirmarImport() {
    if (!importResultado || !projetoId) return
    setImportGravando(true)
    try {
      const resumo = await importarHistograma({
        projetoId,
        baselineAtivaId: baselineAtiva?.id ?? null,
        cargosExistentes: cargos,
        linhas: importResultado.linhas,
      })
      setImportResumo(resumo)
      qc.invalidateQueries({ queryKey: ['histograma-cargos', projetoId] })
      qc.invalidateQueries({ queryKey: ['histograma-planejado', baselineAtiva?.id] })
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

  // Planejado x real por cargo e por mês — agregado no cliente (média das
  // semanas apontadas em cada mês), em vez de uma VIEW no banco: as views do
  // Postgres rodam com o contexto de permissão do dono por padrão, e este
  // projeto não tem nenhum padrão estabelecido de view multi-tenant segura
  // (os únicos 2 exemplos existentes são telas de admin, não dado por
  // organização) — agregar aqui evita esse risco.
  const mensalPorCargo = useMemo(() => {
    const resultado = new Map<string, { monthKey: string; monthLabel: string; planejado: number; real: number | null; semanasApontadas: number; semanasTotais: number }[]>()
    for (const cargo of cargos) {
      const linhas = meses.map((m) => {
        const planejadoVal = planejadoEdits[`${cargo.id}__${m.key}`] ?? planejadoMap.get(`${cargo.id}__${m.key}`) ?? 0
        const semanasDoMes = semanas.filter((s) => s.monthKey === m.key)
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
  }, [cargos, meses, semanas, planejadoMap, realMap, planejadoEdits, realEdits])

  const cargosPorCategoria = useMemo(() => {
    const grupos: Record<'D' | 'I' | 'SEM', typeof cargos> = { D: [], I: [], SEM: [] }
    for (const cargo of cargos) grupos[cargo.categoria ?? 'SEM'].push(cargo)
    return (['D', 'I', 'SEM'] as const).map((chave) => ({ chave, cargos: grupos[chave] })).filter((g) => g.cargos.length > 0)
  }, [cargos])

  const dadosGrafico = useMemo(() => {
    if (cargoSelecionado === '__total__') {
      return meses.map((m) => {
        let planejado = 0
        let real = 0
        let temReal = false
        for (const cargo of cargos) {
          const linha = mensalPorCargo.get(cargo.id)?.find((l) => l.monthKey === m.key)
          if (!linha) continue
          planejado += linha.planejado
          if (linha.real !== null) {
            real += linha.real
            temReal = true
          }
        }
        return { mes: m.label, Planejado: planejado, Real: temReal ? real : null }
      })
    }
    const linhas = mensalPorCargo.get(cargoSelecionado) ?? []
    return linhas.map((l) => ({ mes: l.monthLabel, Planejado: l.planejado, Real: l.real }))
  }, [cargoSelecionado, cargos, mensalPorCargo, meses])

  const cargoOptions = useMemo(
    () => [
      { value: '__total__', label: 'Total (todos os cargos)' },
      ...cargos.map((c) => ({ value: c.id, label: c.nome })),
    ],
    [cargos],
  )

  const baselineOptions = useMemo(
    () => baselines.map((b) => ({ value: b.id, label: `${b.versao}${b.descricao ? ` — ${b.descricao}` : ''}` })),
    [baselines],
  )

  if (!currentProject) {
    return <div className="p-6 text-muted-foreground">Selecione um projeto para ver o Histograma Planejado x Real.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChartIcon className="h-6 w-6 text-primary" /> Histograma Planejado x Real
          </h1>
          <p className="text-sm text-muted-foreground">Mão de obra planejada por baseline e apontamento real semanal.</p>
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
        </div>
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

      <Tabs value={aba} onValueChange={(v) => setAba(v as 'semanal' | 'mensal')}>
        <TabsList>
          <TabsTrigger value="semanal">Lançamento semanal</TabsTrigger>
          <TabsTrigger value="mensal"><Table2 className="h-4 w-4" /> Visão mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal" className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Cada cargo tem duas linhas: <span className="text-blue-600 dark:text-blue-400 font-medium">Planejado (mês)</span> — editar
            em qualquer semana atualiza o mês inteiro — e <span className="text-red-600 dark:text-red-400 font-medium">Real (semana)</span> —
            um valor por semana. Os valores salvam sozinhos ~0,5s depois de parar de digitar. Na semana atual, quando o cargo bate com um
            cargo do Controle de Funcionários (Administração), aparece "Cadastro: N" com o total de funcionários ativos daquele cargo
            vinculados a este projeto — clique pra usar esse número no Real. Os cargos são agrupados por categoria — Direta (MOD) e
            Indireta (MOI) — igual ao Controle de Funcionários.
          </p>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleExportar} disabled={cargos.length === 0}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            {podeEditarPlano && (
              <Button size="sm" variant="outline" onClick={() => setImportAberto(true)}>
                <Upload className="h-4 w-4" /> Importar
              </Button>
            )}
          </div>

          {podeEditarPlano && (
            <div className="flex justify-end">
              {novoCargoAberto ? (
                <div className="flex items-end gap-2 flex-wrap">
                  {funcoesAdministracao.length > 0 && (
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

          {cargos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cargo cadastrado ainda para este projeto.</p>
          )}

          {semanas.length > 0 && cargosPorCategoria.map((grupo) => (
              <Card key={grupo.chave} className="overflow-hidden">
                <div className="px-4 py-2 bg-muted/50 font-semibold text-sm">{CATEGORIA_GRUPO_LABEL[grupo.chave]}</div>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-3 py-2 sticky left-0 bg-card min-w-[140px]">Cargo</th>
                        {semanas.map((s) => (
                          <th key={s.iso} className="px-2 py-2 text-center min-w-[64px] font-medium text-muted-foreground">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.cargos.map((cargo) => {
                        const linhasMes = mensalPorCargo.get(cargo.id) ?? []
                        return (
                          <Fragment key={cargo.id}>
                            <tr className="border-b border-border/50">
                              <td className="px-3 py-1.5 sticky left-0 bg-card">
                                <span className="font-medium">{cargo.nome}</span>
                                <span className="block text-[10px] text-blue-600 dark:text-blue-400">Planejado (mês)</span>
                              </td>
                              {semanas.map((s) => {
                                const mes = `${s.monthKey}-01`
                                const key = `${cargo.id}__${s.monthKey}`
                                const linha = linhasMes.find((l) => l.monthKey === s.monthKey)
                                const valor = planejadoEdits[key] ?? linha?.planejado ?? 0
                                return (
                                  <td key={s.iso} className="px-1 py-1">
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={valor}
                                      disabled={!podeEditarPlano || !baselineAtiva}
                                      title="Valor mensal — editar aqui atualiza todas as semanas do mês"
                                      onChange={(e) => handlePlanejadoChange(cargo.id, mes, e.target.value)}
                                      className="w-14 rounded border border-input bg-background text-center text-blue-600 dark:text-blue-400 disabled:opacity-50"
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                            <tr className="border-b">
                              <td className="px-3 py-1.5 sticky left-0 bg-card text-muted-foreground text-[11px]">Real (semana)</td>
                              {semanas.map((s) => {
                                const key = `${cargo.id}__${s.iso}`
                                const valor = realEdits[key] ?? realMap.get(key) ?? ''
                                const referencia = s.iso === semanaAtualIso ? cadastroPorCargo?.get(normalizarNomeCargo(cargo.nome)) : undefined
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
                                    {referencia !== undefined && (
                                      <button
                                        type="button"
                                        disabled={!podeEditarReal}
                                        title="Vem do Cadastro de Funcionários (Administração) — clique pra usar esse valor"
                                        onClick={() => handleRealChange(cargo.id, s.iso, String(referencia))}
                                        className="mt-0.5 block w-full text-center text-[10px] text-muted-foreground hover:text-primary underline decoration-dotted disabled:pointer-events-none"
                                      >
                                        Cadastro: {referencia}
                                      </button>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
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
                      <th className="px-3 py-2">Planejado</th>
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
                          <td className="px-3 py-1.5 text-center">
                            {podeEditarPlano ? (
                              <input
                                type="number"
                                inputMode="decimal"
                                value={planejadoEdits[`${cargoSelecionado}__${l.monthKey}`] ?? l.planejado}
                                onChange={(e) => handlePlanejadoChange(cargoSelecionado, `${l.monthKey}-01`, e.target.value)}
                                className="w-16 rounded border border-input bg-background text-center"
                              />
                            ) : (
                              l.planejado
                            )}
                          </td>
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
              Envie uma planilha XLSX/CSV no mesmo formato do "Exportar" (Cargo, Categoria, Semana, Planejado (mês), Real (semana)).
              Cargos citados que ainda não existem no projeto são criados automaticamente; reimportar atualiza os valores já existentes.
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
    </div>
  )
}
