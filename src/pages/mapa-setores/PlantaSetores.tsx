import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Crop, MapPin, Square, Printer, Loader2, X, Maximize2, Minimize2, RotateCcw, Search, SlidersHorizontal, Settings2, LocateFixed } from 'lucide-react'
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
import { listEngenheirosArea } from '@/lib/programacao-db'
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

export default function PlantaSetores() {
  const { plantaId } = useParams<{ plantaId: string }>()
  const { userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('engenharia')
  const { currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const projetoId = currentProject?.id

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

  useRealtimeMapaSetores(plantaId, projetoId)

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

  const setoresVisuais = useMemo<SetorVisual[]>(() => {
    return marcadores.map((marcador) => {
      const campos = camposPorMarcador.get(marcador.id) ?? {}
      const engenheiro = engenheiroPorMarcador.get(marcador.id)
      const previsto = campos.avanco_prev?.tipo === 'percentual' ? campos.avanco_prev.pct : null
      const concluido = campos.avanco_concl?.tipo === 'percentual' ? campos.avanco_concl.pct : null
      const orfao = orfaoPorMarcador.get(marcador.id) ?? false
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
      }
    })
  }, [marcadores, camposPorMarcador, engenheiroPorMarcador, orfaoPorMarcador])

  const [filtros, setFiltros] = useState<FiltrosSetores>(FILTROS_SETORES_INICIAIS)
  const [ordenacao, setOrdenacao] = useState<OrdenacaoSetores>('criticidade')
  const [setorSelecionadoId, setSetorSelecionadoId] = useState<string | null>(null)
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
  useEffect(() => {
    const atualizar = () => setEmTelaCheia(document.fullscreenElement === areaFullscreenRef.current)
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
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon">
            <Link to="/dashboard/mapa-setores">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold truncate">{planta.nome}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {podeEditar && (
            <>
              <Button variant={modo === 'recorte' ? 'default' : 'outline'} size="sm" onClick={() => alternarModo('recorte')}>
                <Crop size={15} className="mr-1" />
                Definir visualização padrão
              </Button>
              {plantaRecortada && (
                <Button variant="outline" size="sm" onClick={() => setConfirmarRestauracao(true)}>
                  <RotateCcw size={15} className="mr-1" />
                  Restaurar planta inteira
                </Button>
              )}
              <Button variant={modo === 'ponto' ? 'default' : 'outline'} size="sm" onClick={() => alternarModo('ponto')}>
                {modo === 'ponto' ? <X size={15} className="mr-1" /> : <MapPin size={15} className="mr-1" />}
                {modo === 'ponto' ? 'Cancelar' : '+ Ponto'}
              </Button>
              <Button variant={modo === 'area' ? 'default' : 'outline'} size="sm" onClick={() => alternarModo('area')}>
                {modo === 'area' ? <X size={15} className="mr-1" /> : <Square size={15} className="mr-1" />}
                {modo === 'area' ? 'Cancelar' : '+ Área'}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={15} className="mr-1" />
            Imprimir mapa
          </Button>
          <Button variant="outline" size="sm" onClick={() => void alternarTelaCheia()}>
            {emTelaCheia ? <Minimize2 size={15} className="mr-1" /> : <Maximize2 size={15} className="mr-1" />}
            {emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          </Button>
        </div>
      </header>

      {modo !== 'nenhum' && (
        <p className="text-xs text-muted-foreground print:hidden">
          {modo === 'recorte' && 'Arraste sobre a planta inteira para selecionar a visualização padrão do layout.'}
          {modo === 'ponto' && 'Clique na planta para posicionar o setor.'}
          {modo === 'area' && 'Arraste sobre a planta para desenhar a área do setor.'}
        </p>
      )}

      {marcadores.length > 0 && (
        <p className="text-xs text-muted-foreground print:hidden">
          Clique num setor para ver detalhes. Botão direito, ou o botão de ações no card, configura os vínculos.
        </p>
      )}

      <section className="rounded-lg border bg-card p-3 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 text-muted-foreground" size={16} />
            <Input
              value={filtros.busca}
              onChange={(e) => setFiltros((atual) => ({ ...atual, busca: e.target.value }))}
              className="pl-8"
              placeholder="Buscar setor ou responsável..."
            />
          </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SlidersHorizontal size={15} />
              {setoresFiltrados.length} de {setoresVisuais.length} setores
            </div>
            <select
              aria-label="Ordenar setores"
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as OrdenacaoSetores)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="criticidade">Mais críticos</option>
              <option value="nome">Nome</option>
              <option value="concluido">Maior realizado</option>
              <option value="desvio">Pior desvio</option>
              <option value="engenheiro">Responsável</option>
            </select>
          {(filtros.busca || filtros.status !== 'todos' || filtros.engenheiro !== 'todos' || filtros.somenteOrfaos) && (
            <Button size="sm" variant="ghost" onClick={() => setFiltros(FILTROS_SETORES_INICIAIS)}>
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {RESUMO_STATUS.map((status) => {
            const ativo = filtros.status === status
            const info = status === 'todos' ? null : STATUS_SETORES[status]
            const quantidade = status === 'todos' ? setoresVisuais.length : contagemStatus.get(status) ?? 0
            return (
              <button
                key={status}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltros((atual) => ({ ...atual, status }))}
                className={`rounded-md border p-2 text-left transition-colors ${
                  ativo ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:bg-muted'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{info?.label ?? 'Total'}</span>
                  {info && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.cor }} />}
                </span>
                <b className="mt-1 block text-lg leading-none">{quantidade}</b>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {engenheiros.map((engenheiro) => (
            <button
              key={engenheiro}
              type="button"
              aria-pressed={filtros.engenheiro === engenheiro}
              onClick={() => setFiltros((atual) => ({ ...atual, engenheiro: atual.engenheiro === engenheiro ? 'todos' : engenheiro }))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filtros.engenheiro === engenheiro ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
              }`}
            >
              {engenheiro}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filtros.somenteOrfaos}
            onClick={() => setFiltros((atual) => ({ ...atual, somenteOrfaos: !atual.somenteOrfaos }))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              filtros.somenteOrfaos ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-border hover:bg-muted'
            }`}
          >
            Vínculos órfãos
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {Object.values(STATUS_SETORES).map((status) => (
              <span key={status.id} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.cor }} />
                {status.label}
            </span>
          ))}
        </div>
      </section>

      <div ref={areaFullscreenRef} className={`grid gap-4 lg:grid-cols-[1fr_320px] ${emTelaCheia ? 'h-full overflow-auto bg-background p-4' : ''}`}>
        <div className="min-w-0">
          {imagemUrl && (
            <PalcoSetores
              planta={planta}
              imagemUrl={imagemUrl}
              marcadores={marcadores}
              engenheiroPorMarcador={engenheiroPorMarcador}
              orfaoPorMarcador={orfaoPorMarcador}
              setoresVisuais={setoresVisuais}
              idsVisiveis={idsVisiveis}
              setorSelecionadoId={setorSelecionadoId}
              versaoFoco={versaoFoco}
              modo={modo}
              podeEditar={podeEditar}
              onSelecionarSetor={setSetorSelecionadoId}
              onCriarPendente={(geometria, cardPos) => {
                setPendente({ geometria, cardPos })
                setModo('nenhum')
              }}
              onMoverMarcador={(id, campos) => atualizarMarcador.mutate({ id, ...campos })}
              onRecortar={(crop) => {
                setRecortePendente(crop)
              }}
              onConfigurarCaixa={(id) => setConfigurandoCaixaId(id)}
              onPropriedadesCard={(id) => setPropriedadesId(id)}
            />
          )}
        </div>

        <aside className="space-y-4 print:break-inside-avoid lg:sticky lg:top-4 lg:self-start">
          {emTelaCheia && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => void alternarTelaCheia()}>
              <Minimize2 size={15} className="mr-1" /> Sair da tela cheia
            </Button>
          )}
          {setorSelecionado && (
            <Card className="p-4 space-y-3 border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Setor selecionado</p>
                  <h2 className="font-semibold leading-tight">{setorSelecionado.nome}</h2>
                </div>
                <Badge variant="outline" className={STATUS_SETORES[setorSelecionado.status].classe}>
                  {STATUS_SETORES[setorSelecionado.status].label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Atualizado em {new Date(setorSelecionado.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              {setorSelecionado.engenheiro && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: setorSelecionado.corEngenheiro }} />
                  {setorSelecionado.engenheiro}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded bg-muted/60 p-2">
                  <p className="text-xs text-muted-foreground">Realizado</p>
                  <b>{setorSelecionado.concluido != null ? `${setorSelecionado.concluido.toFixed(0)}%` : '—'}</b>
                </div>
                <div className="rounded bg-muted/60 p-2">
                  <p className="text-xs text-muted-foreground">Planejado</p>
                  <b>{setorSelecionado.previsto != null ? `${setorSelecionado.previsto.toFixed(0)}%` : '—'}</b>
                </div>
                <div className="rounded bg-muted/60 p-2">
                  <p className="text-xs text-muted-foreground">Desvio</p>
                  <b className={setorSelecionado.desvio != null && setorSelecionado.desvio < 0 ? 'text-red-600' : 'text-emerald-600'}>
                    {setorSelecionado.desvio != null ? `${setorSelecionado.desvio >= 0 ? '+' : ''}${setorSelecionado.desvio.toFixed(1)} p.p.` : '—'}
                  </b>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Realizado</span>
                  <span>Marcador: planejado</span>
                </div>
                <ComparacaoAvanco
                  previsto={setorSelecionado.previsto}
                  concluido={setorSelecionado.concluido}
                  cor={STATUS_SETORES[setorSelecionado.status].cor}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded bg-muted/60 p-2">
                  <p className="text-xs text-muted-foreground">Início</p>
                  <b>{setorSelecionado.inicio}</b>
                </div>
                <div className="rounded bg-muted/60 p-2">
                  <p className="text-xs text-muted-foreground">Término</p>
                  <b>{setorSelecionado.termino}</b>
                </div>
              </div>
              {setorSelecionado.orfao && <p className="text-xs text-amber-700">Há atividade vinculada que não existe mais no cronograma atual.</p>}
              <div className="grid grid-cols-2 gap-2">
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => setPropriedadesId(setorSelecionado.id)}>
                    <Settings2 size={14} className="mr-1" /> Vínculo
                  </Button>
                )}
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => setConfigurandoCaixaId(setorSelecionado.id)}>
                    <Settings2 size={14} className="mr-1" /> Caixa
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => selecionarELocalizar(setorSelecionado.id)}>
                  <LocateFixed size={14} className="mr-1" /> Localizar
                </Button>
              </div>
            </Card>
          )}
          <Card className="p-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumo da obra</h3>
            {resumo ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previsão da obra</span>
                  <b>{resumo.previsao.toFixed(0)}%</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avanço concluído</span>
                  <b>{resumo.avancoTotal.toFixed(0)}%</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desvio acumulado</span>
                  <b className={resumo.desvio >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {resumo.desvio >= 0 ? '+' : ''}
                    {resumo.desvio.toFixed(0)} p.p.
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Meta diária</span>
                  <b>{resumo.metaDiaria != null ? `${resumo.metaDiaria.toFixed(2)}%/dia` : '—'}</b>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione uma obra para ver o resumo.</p>
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destaques da obra</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                  <span className="text-muted-foreground">Variação desde a atualização</span>
                <b>{resumo?.avancoDoDia != null ? `${resumo.avancoDoDia >= 0 ? '+' : ''}${resumo.avancoDoDia.toFixed(1)}%` : '—'}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Menor avanço</span>
                <div className="font-medium">
                  {destaqueSetor ? `${destaqueSetor.nome} (${destaqueSetor.avancoConcluido.toFixed(0)}%)` : '—'}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-2 print:hidden">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Setores visíveis</h3>
            {marcadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum setor ainda.</p>
            ) : (
              <div className="space-y-1">
                {setoresOrdenados.map((setor) => (
                  <button
                    key={setor.id}
                    onClick={() => selecionarELocalizar(setor.id)}
                    className={`w-full rounded border px-2 py-2 text-left transition-colors ${
                      setorSelecionadoId === setor.id ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_SETORES[setor.status].cor }} />
                      <span className="truncate">{setor.nome}</span>
                      </span>
                      <b className="shrink-0 text-sm">{setor.concluido != null ? `${setor.concluido.toFixed(0)}%` : '—'}</b>
                    </span>
                    <span className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{setor.engenheiro ?? STATUS_SETORES[setor.status].label}</span>
                      <span className={setor.desvio != null && setor.desvio < 0 ? 'text-red-600' : 'text-emerald-600'}>
                        {setor.desvio != null ? `${setor.desvio >= 0 ? '+' : ''}${setor.desvio.toFixed(1)} p.p.` : '—'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      {pendente && organizacaoId && plantaId && (
        <NovoSetorDialog
          open
          onOpenChange={(v) => !v && setPendente(null)}
          organizacaoId={organizacaoId}
          plantaId={plantaId}
          geometria={pendente.geometria}
          cardPos={pendente.cardPos}
        />
      )}

      <AlertDialog open={!!recortePendente} onOpenChange={(open) => !open && setRecortePendente(null)}>
        <AlertDialogContent>
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
        <AlertDialogContent>
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
        />
      )}
    </div>
  )
}
