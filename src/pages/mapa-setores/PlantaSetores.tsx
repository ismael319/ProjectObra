import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Crop, MapPin, Square, Printer, Loader2, X } from 'lucide-react'
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
  resolverCamposDoMarcador,
  resolverEngenheiroDoMarcador,
  setorComMenorAvanco,
  vinculoOrfao,
  type CampoCard,
  type VinculoCampo,
} from '@/lib/mapa-setores/progresso'
import PalcoSetores, { type NovaGeometria } from '@/components/mapa-setores/PalcoSetores'
import NovoSetorDialog from '@/components/mapa-setores/NovoSetorDialog'
import ConfigurarCaixaDialog from '@/components/mapa-setores/ConfigurarCaixaDialog'
import PropriedadesCardDialog from '@/components/mapa-setores/PropriedadesCardDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type ModoEdicao = 'nenhum' | 'ponto' | 'area' | 'recorte'

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
  const [pendente, setPendente] = useState<{ geometria: NovaGeometria; cardPos: { x: number; y: number } } | null>(null)
  const [configurandoCaixaId, setConfigurandoCaixaId] = useState<string | null>(null)
  const [propriedadesId, setPropriedadesId] = useState<string | null>(null)

  function alternarModo(alvo: 'ponto' | 'area' | 'recorte') {
    setModo((atual) => (atual === alvo ? 'nenhum' : alvo))
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
                Recortar planta
              </Button>
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
        </div>
      </header>

      {modo !== 'nenhum' && (
        <p className="text-xs text-muted-foreground print:hidden">
          {modo === 'recorte' && 'Arraste sobre a planta inteira para selecionar a área que representa o layout.'}
          {modo === 'ponto' && 'Clique na planta para posicionar o setor.'}
          {modo === 'area' && 'Arraste sobre a planta para desenhar a área do setor.'}
        </p>
      )}

      {marcadores.length > 0 && (
        <p className="text-xs text-muted-foreground print:hidden">
          Botão direito num card configura o cronograma e os campos dele (início, término, avanço).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {imagemUrl && (
            <PalcoSetores
              planta={planta}
              imagemUrl={imagemUrl}
              marcadores={marcadores}
              camposPorMarcador={camposPorMarcador}
              engenheiroPorMarcador={engenheiroPorMarcador}
              orfaoPorMarcador={orfaoPorMarcador}
              modo={modo}
              podeEditar={podeEditar}
              onCriarPendente={(geometria, cardPos) => {
                setPendente({ geometria, cardPos })
                setModo('nenhum')
              }}
              onMoverMarcador={(id, campos) => atualizarMarcador.mutate({ id, ...campos })}
              onRecortar={(crop) => {
                if (!planta) return
                atualizarCrop.mutate({ plantaId: planta.id, crop })
                setModo('nenhum')
                toast.success('Recorte aplicado')
              }}
              onConfigurarCaixa={(id) => setConfigurandoCaixaId(id)}
              onPropriedadesCard={(id) => setPropriedadesId(id)}
            />
          )}
        </div>

        <aside className="space-y-4 print:break-inside-avoid">
          <Card className="p-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumo geral</h3>
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
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destaques</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avanço do dia</span>
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
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Setores cadastrados</h3>
            {marcadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum setor ainda.</p>
            ) : (
              <div className="space-y-1">
                {marcadores.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPropriedadesId(m.id)}
                    className="w-full text-left text-sm px-2 py-1.5 rounded border hover:border-blue-500 truncate"
                  >
                    {m.nome}
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
