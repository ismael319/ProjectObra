import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, BarChart3, Building2, Layers3, ListFilter, Printer, Loader2, X, Minimize2, RotateCcw, Search, Settings2, LocateFixed, PanelRightClose, PanelRightOpen, MapPin, Square } from 'lucide-react'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import {
  usePlantaSetores,
  usePlantaSetoresUrl,
  useAtualizarCropSetor,
  useMarcadores,
  useAtualizarMarcador,
  useCamposDosMarcadores,
  useRealtimeMapaSetores,
} from '@/lib/mapa-setores/mapa-setores-db'
import { getActivitiesInDateRange, listEngenheirosArea } from '@/lib/programacao-db'
import { CAMADAS_MAPA, legendaDaCamada, resolverProgramacaoHoje, type CamadaMapaId, type SetorComCamada } from '@/lib/mapa-setores/camadas'
import {
  calcularResumoGeral,
  formatarValorCampo,
  resolverCamposDoMarcador,
  resolverEngenheiroDoMarcador,
  setorComMenorAvanco,
  vinculoOrfao,
  type CampoCard,
  type VinculoCampo,
} from '@/lib/mapa-setores/progresso'
import {
  calcularDesvioSetor,
  classificarStatusSetor,
  FILTROS_SETORES_INICIAIS,
  filtrarSetores,
  ordenarSetores,
  STATUS_SETORES,
  type FiltrosSetores,
  type OrdenacaoSetores,
  type SetorVisual,
  type StatusSetor,
} from '@/lib/mapa-setores/status'
import PalcoSetores, { type NovaGeometria } from '@/components/mapa-setores/PalcoSetores'
import ComparacaoAvanco from '@/components/mapa-setores/ComparacaoAvanco'
import NovoSetorDialog from '@/components/mapa-setores/NovoSetorDialog'
import ConfigurarCaixaDialog from '@/components/mapa-setores/ConfigurarCaixaDialog'
import PropriedadesCardDialog from '@/components/mapa-setores/PropriedadesCardDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type ModoEdicao = 'nenhum' | 'ponto' | 'area' | 'recorte'

const RESUMO_STATUS = ['todos', 'atrasado', 'atencao', 'em_dia', 'concluido', 'sem_dados'] as const

function hojeLocalIso() {
  const data = new Date()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

export default function PlantaSetores() {
  const { plantaId } = useParams<{ plantaId: string }>()
  const { userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('engenharia')
  const { currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const projetoId = currentProject?.id
  const hoje = hojeLocalIso()

  const { data: planta, isLoading: carregandoPlanta } = usePlantaSetores(plantaId)
  const { data: imagemUrl } = usePlantaSetoresUrl(planta?.arquivo_path)
  const { data: marcadores = [] } = useMarcadores(plantaId)
  const marcadorIds = useMemo(() => marcadores.map((m) => m.id), [marcadores])
  const { data: camposRows = [] } = useCamposDosMarcadores(marcadorIds)

  const { data: engenheirosArea = [] } = useQuery({
    queryKey: ['programacao_engenheiros_area', projetoId],
    enabled: !!projetoId,
    queryFn: () => listEngenheirosArea(projetoId!),
  })
  const { data: atividadesHoje = [] } = useQuery({
    queryKey: ['programacao_atividades_hoje', organizacaoId, projetoId, hoje],
    enabled: !!organizacaoId && !!projetoId,
    queryFn: () => getActivitiesInDateRange(organizacaoId!, projetoId!, hoje, hoje),
  })

  useRealtimeMapaSetores(plantaId, projetoId, marcadorIds)

  const atualizarMarcador = useAtualizarMarcador(plantaId)
  const atualizarCrop = useAtualizarCropSetor(organizacaoId, projetoId)

  const cronogramasAtivos = useMemo(() => (currentProject?.cronogramas ?? []).filter((c) => c.ativo), [currentProject])
  const cronogramaPorId = useMemo(() => new Map(cronogramasAtivos.map((c) => [c.id, c])), [cronogramasAtivos])

  const vinculosPorMarcador = useMemo(() => {
    const m = new Map<string, VinculoCampo[]>()
    for (const row of camposRows) {
      const lista = m.get(row.marcador_id) ?? []
      lista.push({ campo: row.campo, fonteTipo: row.fonte_tipo, activityUid: row.activity_uid, customFieldId: row.custom_field_id })
      m.set(row.marcador_id, lista)
    }
    return m
  }, [camposRows])

  const camposPorMarcador = useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolverCamposDoMarcador>>()
    for (const marcador of marcadores) {
      const cronograma = marcador.cronograma_id ? cronogramaPorId.get(marcador.cronograma_id) : undefined
      m.set(marcador.id, resolverCamposDoMarcador(cronograma, vinculosPorMarcador.get(marcador.id) ?? []))
    }
    return m
  }, [marcadores, vinculosPorMarcador, cronogramaPorId])

  const engenheiroPorMarcador = useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolverEngenheiroDoMarcador>>()
    for (const marcador of marcadores) {
      const cronograma = marcador.cronograma_id ? cronogramaPorId.get(marcador.cronograma_id) : undefined
      m.set(marcador.id, resolverEngenheiroDoMarcador(cronograma, vinculosPorMarcador.get(marcador.id) ?? [], engenheirosArea))
    }
    return m
  }, [marcadores, vinculosPorMarcador, cronogramaPorId, engenheirosArea])

  const orfaoPorMarcador = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const marcador of marcadores) {
      const cronograma = marcador.cronograma_id ? cronogramaPorId.get(marcador.cronograma_id) : undefined
      const lista = vinculosPorMarcador.get(marcador.id) ?? []
      m.set(marcador.id, lista.length > 0 && lista.some((v) => vinculoOrfao(cronograma, v)))
    }
    return m
  }, [marcadores, vinculosPorMarcador, cronogramaPorId])

  const setoresVisuais = useMemo<SetorComCamada[]>(() => {
    return marcadores.map((marcador) => {
      const campos = camposPorMarcador.get(marcador.id) ?? {}
      const engenheiro = engenheiroPorMarcador.get(marcador.id)
      const previsto = campos.avanco_prev?.tipo === 'percentual' ? campos.avanco_prev.pct : null
      const concluido = campos.avanco_concl?.tipo === 'percentual' ? campos.avanco_concl.pct : null
      const orfao = orfaoPorMarcador.get(marcador.id) ?? false
      const taskUids = (vinculosPorMarcador.get(marcador.id) ?? []).map((vinculo) => String(vinculo.activityUid))
      return {
        id: marcador.id,
        nome: marcador.nome,
        engenheiro: engenheiro?.nome ?? null,
        corEngenheiro: engenheiro?.cor ?? '#64748b',
        previsto,
        concluido,
        desvio: calcularDesvioSetor(previsto, concluido),
        status: classificarStatusSetor(previsto, concluido),
        orfao,
        inicio: formatarValorCampo(campos.inicio),
        termino: formatarValorCampo(campos.termino),
        atualizadoEm: marcador.atualizado_em,
        programacaoHoje: resolverProgramacaoHoje(taskUids, atividadesHoje),
      }
    })
  }, [marcadores, camposPorMarcador, engenheiroPorMarcador, orfaoPorMarcador, vinculosPorMarcador, atividadesHoje])

  const [filtros, setFiltros] = useState<FiltrosSetores>(FILTROS_SETORES_INICIAIS)
  const [camada, setCamada] = useState<CamadaMapaId>('status')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [ordenacao, setOrdenacao] = useState<OrdenacaoSetores>('criticidade')
  const [setorSelecionadoId, setSetorSelecionadoId] = useState<string | null>(null)
  const [sheetOcultoId, setSheetOcultoId] = useState<string | null>(null)
  const [versaoFoco, setVersaoFoco] = useState(0)
  const setoresFiltrados = useMemo(() => filtrarSetores(setoresVisuais, filtros), [setoresVisuais, filtros])
  const setoresOrdenados = useMemo(() => ordenarSetores(setoresFiltrados, ordenacao), [setoresFiltrados, ordenacao])
  const idsVisiveis = useMemo(() => new Set(setoresFiltrados.map((setor) => setor.id)), [setoresFiltrados])
  const setorSelecionado = useMemo(
    () => setoresVisuais.find((setor) => setor.id === setorSelecionadoId) ?? null,
    [setoresVisuais, setorSelecionadoId],
  )
  const engenheiros = useMemo(
    () => [...new Set(setoresVisuais.map((setor) => setor.engenheiro).filter((nome): nome is string => !!nome))].sort((a, b) => a.localeCompare(b)),
    [setoresVisuais],
  )
  const contagemStatus = useMemo(() => {
    const total = new Map<StatusSetor, number>()
    for (const setor of setoresVisuais) total.set(setor.status, (total.get(setor.status) ?? 0) + 1)
    return total
  }, [setoresVisuais])
  const legendaCamada = useMemo(() => legendaDaCamada(camada, setoresVisuais), [camada, setoresVisuais])
  const possuiFiltrosAtivos = filtros.busca || filtros.status !== 'todos' || filtros.engenheiro !== 'todos' || filtros.somenteOrfaos
  const totalFiltrosAtivos = Number(filtros.status !== 'todos') + Number(filtros.engenheiro !== 'todos') + Number(filtros.somenteOrfaos)

  useEffect(() => {
    if (setorSelecionadoId && !idsVisiveis.has(setorSelecionadoId)) setSetorSelecionadoId(null)
  }, [setorSelecionadoId, idsVisiveis])

  useEffect(() => {
    const limparSelecao = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSetorSelecionadoId(null)
    }
    window.addEventListener('keydown', limparSelecao)
    return () => window.removeEventListener('keydown', limparSelecao)
  }, [])

  const areaFullscreenRef = useRef<HTMLDivElement>(null)
  const [emTelaCheia, setEmTelaCheia] = useState(false)
  const fullscreenContainer = emTelaCheia ? areaFullscreenRef.current ?? undefined : undefined
  const [resumoVisivel, setResumoVisivel] = useState(true)
  useEffect(() => {
    const atualizar = () => {
      const emCheia = document.fullscreenElement === areaFullscreenRef.current
      setEmTelaCheia(emCheia)
      if (!emCheia) setResumoVisivel(true)
    }
    document.addEventListener('fullscreenchange', atualizar)
    return () => document.removeEventListener('fullscreenchange', atualizar)
  }, [])

  async function alternarTelaCheia() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await areaFullscreenRef.current?.requestFullscreen()
  }

  const resumo = currentProject ? calcularResumoGeral(currentProject) : null

  const destaqueSetor = useMemo(() => {
    const CAMPO: CampoCard = 'avanco_concl'
    return setorComMenorAvanco(
      marcadores.map((m) => {
        const valor = camposPorMarcador.get(m.id)?.[CAMPO]
        return { id: m.id, nome: m.nome, avancoConcluido: valor?.tipo === 'percentual' ? valor.pct : null }
      }),
    )
  }, [marcadores, camposPorMarcador])

  const [modo, setModo] = useState<ModoEdicao>('nenhum')
  const [recortePendente, setRecortePendente] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [confirmarRestauracao, setConfirmarRestauracao] = useState(false)
  const [pendente, setPendente] = useState<{ geometria: NovaGeometria; cardPos: { x: number; y: number } } | null>(null)
  const [configurandoCaixaId, setConfigurandoCaixaId] = useState<string | null>(null)
  const [propriedadesId, setPropriedadesId] = useState<string | null>(null)

  function alternarModo(alvo: 'ponto' | 'area' | 'recorte') {
    setModo((atual) => (atual === alvo ? 'nenhum' : alvo))
  }

  function selecionarELocalizar(id: string) {
    setSetorSelecionadoId(id)
    setSheetOcultoId(null)
    setVersaoFoco((atual) => atual + 1)
  }

  async function aplicarRecortePermanente() {
    if (!planta || !recortePendente) return
    try {
      await atualizarCrop.mutateAsync({ plantaId: planta.id, crop: recortePendente })
      setRecortePendente(null)
      setModo('nenhum')
      toast.success('Visualização padrão atualizada')
    } catch (err) {
      toast.error(`Não foi possível atualizar a visualização: ${err instanceof Error ? err.message : err}`)
    }
  }

  async function restaurarPlantaInteira() {
    if (!planta) return
    try {
      await atualizarCrop.mutateAsync({
        plantaId: planta.id,
        crop: { x: 0, y: 0, w: planta.largura_natural, h: planta.altura_natural },
      })
      setConfirmarRestauracao(false)
      setModo('nenhum')
      toast.success('Planta inteira restaurada')
    } catch (err) {
      toast.error(`Não foi possível restaurar a planta: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (carregandoPlanta) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Carregando…
      </div>
    )
  }

  if (!planta) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Planta não encontrada.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link to="/dashboard/mapa-setores">Voltar</Link>
        </Button>
      </div>
    )
  }

  const marcadorConfigurandoCaixa = configurandoCaixaId ? marcadores.find((m) => m.id === configurandoCaixaId) : undefined
  const marcadorPropriedades = propriedadesId ? marcadores.find((m) => m.id === propriedadesId) : undefined
  const plantaRecortada = planta.crop_x !== 0 || planta.crop_y !== 0 || planta.crop_w !== planta.largura_natural || planta.crop_h !== planta.altura_natural

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 rounded-xl">
              <Link to="/dashboard/mapa-setores"><ArrowLeft size={18} /></Link>
            </Button>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20"><Layers3 size={20} /></div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"><Building2 size={12} />{currentProject?.nome ?? 'Obra selecionada'}</p>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{planta.nome}</h1>
              <p className="mt-1 text-xs text-muted-foreground">Mapa operacional · {marcadores.length} {marcadores.length === 1 ? 'setor' : 'setores'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              {plantaRecortada && podeEditar && <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setConfirmarRestauracao(true)} title="Restaurar planta inteira"><RotateCcw size={16} /></Button>}
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => window.print()} title="Imprimir mapa"><Printer size={16} /></Button>
            </div>
          </div>
        </div>
      </header>

      {marcadores.length > 0 && <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-card print:hidden sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"><ListFilter size={13} /> Setores</p><p className="mt-0.5 text-sm font-medium">{setoresFiltrados.length} de {setoresVisuais.length} visíveis</p></div>
          {possuiFiltrosAtivos && <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setFiltros(FILTROS_SETORES_INICIAIS)}>Limpar filtros</Button>}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><Input value={filtros.busca} onChange={(e) => setFiltros((atual) => ({ ...atual, busca: e.target.value }))} className="h-10 rounded-xl border-border/80 bg-muted/20 pl-9 shadow-none" placeholder="Buscar setor ou responsável..." /></div>
          <Select value={ordenacao} onValueChange={(valor) => setOrdenacao(valor as OrdenacaoSetores)}><SelectTrigger aria-label="Ordenar setores" className="h-10 w-full rounded-xl bg-background sm:w-48"><SelectValue placeholder="Ordenar setores" /></SelectTrigger><SelectContent><SelectItem value="criticidade">Mais críticos</SelectItem><SelectItem value="nome">Nome</SelectItem><SelectItem value="concluido">Maior realizado</SelectItem><SelectItem value="desvio">Pior desvio</SelectItem><SelectItem value="engenheiro">Responsável</SelectItem></SelectContent></Select>
          <Button variant="outline" className="h-10 rounded-xl lg:hidden" onClick={() => setFiltrosAbertos((aberto) => !aberto)} aria-expanded={filtrosAbertos}><ListFilter size={16} /> Filtros{totalFiltrosAtivos > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{totalFiltrosAtivos}</span>}</Button>
        </div>
        <div className="mt-3 hidden lg:block"><FiltrosDetalhados filtros={filtros} setFiltros={setFiltros} contagemStatus={contagemStatus} setoresVisuais={setoresVisuais} engenheiros={engenheiros} /></div>
        <Collapsible open={filtrosAbertos} className="lg:hidden"><CollapsibleContent className="mt-3"><FiltrosDetalhados filtros={filtros} setFiltros={setFiltros} contagemStatus={contagemStatus} setoresVisuais={setoresVisuais} engenheiros={engenheiros} /></CollapsibleContent></Collapsible>
      </section>}

      <div ref={areaFullscreenRef} className={`grid gap-4 ${emTelaCheia ? 'h-full grid-cols-1 bg-background p-0' : 'lg:grid-cols-[minmax(0,1fr)_360px]'}`}>
        <div className={`min-w-0 ${emTelaCheia ? 'relative h-full' : ''}`}>
          {imagemUrl ? (
            <PalcoSetores
              planta={planta}
              imagemUrl={imagemUrl}
              marcadores={marcadores}
              engenheiroPorMarcador={engenheiroPorMarcador}
              orfaoPorMarcador={orfaoPorMarcador}
              setoresVisuais={setoresVisuais}
              camada={camada}
              camadas={CAMADAS_MAPA}
              legenda={legendaCamada}
              onCamadaChange={setCamada}
              idsVisiveis={idsVisiveis}
              setorSelecionadoId={setorSelecionadoId}
              versaoFoco={versaoFoco}
              modo={modo}
              podeEditar={podeEditar}
              onSelecionarSetor={(id) => {
                setSetorSelecionadoId(id)
                setSheetOcultoId(null)
              }}
              onCriarPendente={(geometria, cardPos) => {
                setPendente({ geometria, cardPos })
                setModo('nenhum')
              }}
              onMoverMarcador={(id, campos) => atualizarMarcador.mutate({ id, ...campos })}
              onRecortar={(crop) => setRecortePendente(crop)}
              onCancelarModo={() => setModo('nenhum')}
              onAlternarModo={alternarModo}
              emTelaCheia={emTelaCheia}
              onAlternarTelaCheia={() => void alternarTelaCheia()}
              onConfigurarCaixa={(id) => setConfigurandoCaixaId(id)}
              onPropriedadesCard={(id) => setPropriedadesId(id)}
            />
          ) : (
            <div className="relative min-h-[400px] w-full animate-pulse rounded-2xl border border-border/80 bg-muted/30" aria-label="Carregando mapa…" role="status">
              <span className="sr-only">Carregando mapa…</span>
            </div>
          )}
        </div>

        {!emTelaCheia && (
          <aside className="space-y-4 print:break-inside-avoid lg:sticky lg:top-4 lg:self-start">
            {setorSelecionado && (
              <Card className="hidden space-y-4 rounded-2xl border-primary/35 p-5 shadow-card lg:block">
                <DetalhesSetor setor={setorSelecionado} podeEditar={podeEditar} onVinculo={() => setPropriedadesId(setorSelecionado.id)} onCaixa={() => setConfigurandoCaixaId(setorSelecionado.id)} onLocalizar={() => selecionarELocalizar(setorSelecionado.id)} />
              </Card>
            )}
            <Card className="space-y-4 rounded-2xl border-border/70 p-5 shadow-card">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BarChart3 size={14} /></span>
                <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Resumo da obra</h3>
              </div>
              {resumo ? (
                <>
                  <div className="grid grid-cols-2 gap-3"><ResumoMetrica label="Previsão" valor={`${resumo.previsao.toFixed(0)}%`} /><ResumoMetrica label="Realizado" valor={`${resumo.avancoTotal.toFixed(0)}%`} destaque /></div>
                  <div className="space-y-2"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Avanço x previsão</span><span className={resumo.desvio >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{resumo.desvio >= 0 ? '+' : ''}{resumo.desvio.toFixed(0)} p.p.</span></div><ComparacaoAvanco previsto={resumo.previsao} concluido={resumo.avancoTotal} cor="var(--primary)" /></div>
                  <div className="space-y-2 border-t border-border/70 pt-3 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Meta diária</span><b>{resumo.metaDiaria != null ? `${resumo.metaDiaria.toFixed(2)}%/dia` : '—'}</b></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Avanço hoje</span><b>{resumo.avancoDoDia != null ? `${resumo.avancoDoDia >= 0 ? '+' : ''}${resumo.avancoDoDia.toFixed(2)}%` : '—'}</b></div><div><span className="text-muted-foreground">Setor com menor avanço</span><p className="mt-1 truncate font-medium text-foreground">{destaqueSetor ? `${destaqueSetor.nome} (${destaqueSetor.avancoConcluido.toFixed(0)}%)` : '—'}</p></div></div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Selecione uma obra para ver o resumo.</p>
              )}
            </Card>

            <Card className="space-y-4 rounded-2xl border-border/70 p-5 shadow-card print:hidden">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Layers3 size={14} /></span><h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Setores visíveis</h3></div><span className="text-xs tabular-nums text-muted-foreground">{setoresOrdenados.length}</span></div>
              {marcadores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum setor ainda.</p>
              ) : (
                <div className="max-h-[min(42dvh,34rem)] space-y-1 overflow-y-auto pr-1">
                  {setoresOrdenados.map((setor) => (
                    <button
                      key={setor.id}
                      onClick={() => selecionarELocalizar(setor.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                        setorSelecionadoId === setor.id ? 'border-primary/45 bg-primary/8 shadow-sm' : 'border-transparent hover:border-primary/25 hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_SETORES[setor.status].cor }} />
                        <span className="truncate text-sm font-medium">{setor.nome}</span>
                        </span>
                        <b className="shrink-0 text-sm tabular-nums">{setor.concluido != null ? `${setor.concluido.toFixed(0)}%` : '—'}</b>
                      </span>
                      <span className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{setor.engenheiro ?? STATUS_SETORES[setor.status].label}</span>
                        <span className={setor.desvio != null && setor.desvio < 0 ? 'font-medium text-red-600' : 'font-medium text-emerald-600'}>
                          {setor.desvio != null ? `${setor.desvio >= 0 ? '+' : ''}${setor.desvio.toFixed(1)} p.p.` : '—'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        )}

        {emTelaCheia && (
          <>
            <div className="fixed right-4 top-4 z-40 flex items-center gap-1 rounded-xl border border-border/80 bg-background/90 p-1 shadow-elevated backdrop-blur-xl">
              {podeEditar && (
                <>
                  <button
                    type="button"
                    aria-label="Criar setor por ponto"
                    title="Criar setor por ponto"
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${modo === 'ponto' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`}
                    onClick={() => alternarModo('ponto')}
                  >
                    {modo === 'ponto' ? <X size={15} /> : <MapPin size={15} />}
                    <span className="text-xs font-medium">Ponto</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Criar setor por área"
                    title="Criar setor por área"
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${modo === 'area' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`}
                    onClick={() => alternarModo('area')}
                  >
                    {modo === 'area' ? <X size={15} /> : <Square size={15} />}
                    <span className="text-xs font-medium">Área</span>
                  </button>
                  <span className="h-5 w-px bg-border" />
                </>
              )}
              <button
                type="button"
                aria-label={resumoVisivel ? 'Ocultar resumo' : 'Mostrar resumo'}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                onClick={() => setResumoVisivel((v) => !v)}
              >
                {resumoVisivel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            </div>

            {resumoVisivel && (
              <div className="fixed right-4 top-16 bottom-4 z-30 w-[340px] overflow-y-auto rounded-2xl border border-border/80 bg-background/90 p-5 shadow-elevated backdrop-blur-xl animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BarChart3 size={14} /></span>
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Resumo da obra</h3>
                  </div>
                  <button type="button" aria-label="Fechar resumo" className="flex size-7 items-center justify-center rounded-lg hover:bg-muted" onClick={() => setResumoVisivel(false)}>
                    <X size={14} />
                  </button>
                </div>
                {resumo ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <ResumoMetrica label="Previsão" valor={`${resumo.previsao.toFixed(0)}%`} />
                      <ResumoMetrica label="Realizado" valor={`${resumo.avancoTotal.toFixed(0)}%`} destaque />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Avanço x previsão</span>
                        <span className={resumo.desvio >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{resumo.desvio >= 0 ? '+' : ''}{resumo.desvio.toFixed(0)} p.p.</span>
                      </div>
                      <ComparacaoAvanco previsto={resumo.previsao} concluido={resumo.avancoTotal} cor="var(--primary)" />
                    </div>
                    <div className="space-y-2 border-t border-border/70 pt-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Meta diária</span>
                        <b>{resumo.metaDiaria != null ? `${resumo.metaDiaria.toFixed(2)}%/dia` : '—'}</b>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Avanço hoje</span>
                        <b>{resumo.avancoDoDia != null ? `${resumo.avancoDoDia >= 0 ? '+' : ''}${resumo.avancoDoDia.toFixed(2)}%` : '—'}</b>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Setor com menor avanço</span>
                        <p className="mt-1 truncate font-medium text-foreground">{destaqueSetor ? `${destaqueSetor.nome} (${destaqueSetor.avancoConcluido.toFixed(0)}%)` : '—'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Selecione uma obra para ver o resumo.</p>
                )}

                {setorSelecionado && (
                  <div className="mt-4 border-t border-border/70 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers3 size={14} /></span>
                      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Detalhes do setor</h3>
                    </div>
                    <DetalhesSetor setor={setorSelecionado} podeEditar={podeEditar} onVinculo={() => setPropriedadesId(setorSelecionado.id)} onCaixa={() => setConfigurandoCaixaId(setorSelecionado.id)} onLocalizar={() => selecionarELocalizar(setorSelecionado.id)} />
                  </div>
                )}

                <div className="mt-6 border-t border-border/70 pt-4">
                  <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={() => void alternarTelaCheia()}>
                    <Minimize2 size={15} /> Sair da tela cheia
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {setorSelecionado && sheetOcultoId !== setorSelecionado.id && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={`Detalhes do setor ${setorSelecionado.nome}`}>
          <button type="button" aria-label="Fechar detalhes do setor" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px] animate-in fade-in duration-200" onClick={() => setSheetOcultoId(setorSelecionado.id)} />
          <section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[1.5rem] border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-elevated animate-in slide-in-from-bottom duration-300">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
            <div className="mb-4 flex items-center justify-between"><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Detalhes do setor</p><Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => setSheetOcultoId(setorSelecionado.id)}><X size={17} /></Button></div>
            <DetalhesSetor setor={setorSelecionado} podeEditar={podeEditar} onVinculo={() => setPropriedadesId(setorSelecionado.id)} onCaixa={() => setConfigurandoCaixaId(setorSelecionado.id)} onLocalizar={() => { selecionarELocalizar(setorSelecionado.id); setSheetOcultoId(setorSelecionado.id) }} />
          </section>
        </div>
      )}

      {pendente && organizacaoId && plantaId && (
        <NovoSetorDialog
          open
          onOpenChange={(v) => !v && setPendente(null)}
          organizacaoId={organizacaoId}
          plantaId={plantaId}
          geometria={pendente.geometria}
          cardPos={pendente.cardPos}
          container={fullscreenContainer}
        />
      )}

      <AlertDialog open={!!recortePendente} onOpenChange={(open) => !open && setRecortePendente(null)}>
        <AlertDialogContent container={fullscreenContainer}>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar visualização padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              A área selecionada será exibida como padrão para esta planta. Você poderá restaurar a planta inteira depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void aplicarRecortePermanente()} disabled={atualizarCrop.isPending}>
              Aplicar visualização
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarRestauracao} onOpenChange={setConfirmarRestauracao}>
        <AlertDialogContent container={fullscreenContainer}>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar planta inteira?</AlertDialogTitle>
            <AlertDialogDescription>
              A visualização padrão voltará para a imagem completa. Nenhum setor, card ou vínculo será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restaurarPlantaInteira()} disabled={atualizarCrop.isPending}>
              Restaurar planta inteira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {marcadorConfigurandoCaixa && plantaId && (
        <ConfigurarCaixaDialog
          open
          onOpenChange={(v) => !v && setConfigurandoCaixaId(null)}
          plantaId={plantaId}
          marcador={marcadorConfigurandoCaixa}
          container={fullscreenContainer}
        />
      )}

      {marcadorPropriedades && organizacaoId && plantaId && (
        <PropriedadesCardDialog
          open
          onOpenChange={(v) => !v && setPropriedadesId(null)}
          organizacaoId={organizacaoId}
          plantaId={plantaId}
          marcador={marcadorPropriedades}
          cronogramasAtivos={cronogramasAtivos}
          camposAtuais={vinculosPorMarcador.get(marcadorPropriedades.id) ?? []}
          container={fullscreenContainer}
        />
      )}
    </div>
  )
}

function FiltrosDetalhados({
  filtros,
  setFiltros,
  contagemStatus,
  setoresVisuais,
  engenheiros,
}: {
  filtros: FiltrosSetores
  setFiltros: Dispatch<SetStateAction<FiltrosSetores>>
  contagemStatus: Map<StatusSetor, number>
  setoresVisuais: SetorVisual[]
  engenheiros: string[]
}) {
  return (
    <div className="space-y-3 border-t border-border/70 pt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {RESUMO_STATUS.map((status) => {
          const ativo = filtros.status === status
          const info = status === 'todos' ? null : STATUS_SETORES[status]
          const quantidade = status === 'todos' ? setoresVisuais.length : contagemStatus.get(status) ?? 0
          return (
            <button key={status} type="button" aria-pressed={ativo} onClick={() => setFiltros((atual) => ({ ...atual, status }))} className={`rounded-xl border p-2.5 text-left transition-all ${ativo ? 'border-primary/45 bg-primary/8 ring-1 ring-primary/15' : 'border-border/80 bg-muted/15 hover:border-primary/25 hover:bg-muted/40'}`}>
              <span className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{info?.label ?? 'Total'}</span>{info && <span className="size-2 rounded-full" style={{ backgroundColor: info.cor }} />}</span>
              <b className="mt-1.5 block text-lg leading-none tabular-nums">{quantidade}</b>
            </button>
          )
        })}
      </div>
      {(engenheiros.length > 0 || setoresVisuais.some((setor) => setor.orfao)) && <div className="flex flex-wrap gap-1.5">
        {engenheiros.map((engenheiro) => <button key={engenheiro} type="button" aria-pressed={filtros.engenheiro === engenheiro} onClick={() => setFiltros((atual) => ({ ...atual, engenheiro: atual.engenheiro === engenheiro ? 'todos' : engenheiro }))} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${filtros.engenheiro === engenheiro ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{engenheiro}</button>)}
        {setoresVisuais.some((setor) => setor.orfao) && <button type="button" aria-pressed={filtros.somenteOrfaos} onClick={() => setFiltros((atual) => ({ ...atual, somenteOrfaos: !atual.somenteOrfaos }))} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${filtros.somenteOrfaos ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300' : 'border-border hover:bg-muted'}`}>Vínculos órfãos</button>}
      </div>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        {Object.values(STATUS_SETORES).map((status) => <span key={status.id} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: status.cor }} />{status.label}</span>)}
      </div>
    </div>
  )
}

function ResumoMetrica({ label, valor, destaque = false }: { label: string; valor: string; destaque?: boolean }) {
  return <div className={`rounded-xl border p-3 ${destaque ? 'border-primary/20 bg-primary/7' : 'border-border/70 bg-muted/25'}`}><p className="text-[11px] font-medium text-muted-foreground">{label}</p><b className="mt-1 block text-lg leading-none tabular-nums">{valor}</b></div>
}

function DetalhesSetor({
  setor,
  podeEditar,
  onVinculo,
  onCaixa,
  onLocalizar,
}: {
  setor: SetorVisual
  podeEditar: boolean
  onVinculo: () => void
  onCaixa: () => void
  onLocalizar: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Setor selecionado</p><h2 className="mt-1 truncate text-lg font-semibold tracking-tight">{setor.nome}</h2></div><Badge variant="outline" className={STATUS_SETORES[setor.status].classe}>{STATUS_SETORES[setor.status].label}</Badge></div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Atualizado em {new Date(setor.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>{setor.engenheiro && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: setor.corEngenheiro }} />{setor.engenheiro}</span>}</div>
      <div className="grid grid-cols-3 gap-2 text-sm"><ResumoMetrica label="Realizado" valor={setor.concluido != null ? `${setor.concluido.toFixed(0)}%` : '—'} destaque /><ResumoMetrica label="Planejado" valor={setor.previsto != null ? `${setor.previsto.toFixed(0)}%` : '—'} /><div className="rounded-xl border border-border/70 bg-muted/25 p-3"><p className="text-[11px] font-medium text-muted-foreground">Desvio</p><b className={`mt-1 block text-lg leading-none tabular-nums ${setor.desvio != null && setor.desvio < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{setor.desvio != null ? `${setor.desvio >= 0 ? '+' : ''}${setor.desvio.toFixed(1)} p.p.` : '—'}</b></div></div>
      <div><div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Realizado</span><span>Marcador: planejado</span></div><ComparacaoAvanco previsto={setor.previsto} concluido={setor.concluido} cor={STATUS_SETORES[setor.status].cor} /></div>
      <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl border border-border/70 bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground">Início</p><b className="mt-1 block">{setor.inicio}</b></div><div className="rounded-xl border border-border/70 bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground">Término</p><b className="mt-1 block">{setor.termino}</b></div></div>
      {setor.orfao && <p className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Há atividade vinculada que não existe mais no cronograma atual.</p>}
      <div className={`grid gap-2 ${podeEditar ? 'grid-cols-3' : 'grid-cols-1'}`}>{podeEditar && <Button size="sm" variant="outline" className="rounded-lg" onClick={onVinculo}><Settings2 size={14} /> Vínculo</Button>}{podeEditar && <Button size="sm" variant="outline" className="rounded-lg" onClick={onCaixa}><Settings2 size={14} /> Caixa</Button>}<Button size="sm" variant="outline" className="rounded-lg" onClick={onLocalizar}><LocateFixed size={14} /> Localizar</Button></div>
    </div>
  )
}
