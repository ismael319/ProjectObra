import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Loader2, Plus, Save, Crop, MousePointerClick, Ruler, Trash2, Undo2,
  FileDown, ImageDown, Share2, Crosshair, Square, Circle, Palette, Rows3, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ChevronsLeft, ChevronsRight, ChevronsUp, ChevronsDown,
} from 'lucide-react'
import { downloadNodeAsPdf, downloadNodeAsPng, shareNodeAsPng, canShareFiles } from '@/lib/png-export'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import {
  usePlantas, usePlantaUrl, useGrades, useCelulasDeVariasGrades,
  useSegmentosDeVariasGrades, useStatusDeVariasGrades,
  useMarcarCelulas, useAtualizarGrade, useAtualizarCrop, useCriarGrade,
  useExcluirGrade, useGrupos, useCriarGrupo,
  useCriarSegmento, useAtualizarSegmento, useExcluirSegmento,
  useAtualizarFiltroVisual, useAtualizarStatus,
  type MapaGrade, type MapaPlanta, type MapaSegmento, type MapaStatusRow, type StatusInput,
} from '@/lib/mapa-avanco/mapa-db'
import {
  calcularAvanco, formatarPct, formatarQuantidade, chaveCelula, calibrarPorExtremos,
} from '@/lib/mapa-avanco/calculo'
import { MODELOS } from '@/lib/mapa-avanco/modelos'
import MapaViewport, {
  type ModoMapa, type CelulaRef, type PontoImagem, type CamadaGrade,
} from '@/components/mapa-avanco/MapaViewport'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const FILTROS: { valor: MapaPlanta['filtro_visual']; label: string }[] = [
  { valor: 'normal', label: 'Original' },
  { valor: 'cinza', label: 'Preto e branco' },
  { valor: 'suave', label: 'Esmaecida' },
  { valor: 'cinza-suave', label: 'P&B esmaecida' },
]

export default function PlantaDetalhe() {
  const { plantaId } = useParams<{ plantaId: string }>()
  const { user, userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('engenharia')
  const { currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const { data: plantas = [], isLoading: carregandoPlantas } = usePlantas(organizacaoId, currentProject?.id)
  const planta = plantas.find((p) => p.id === plantaId)

  const { data: imagemUrl, isLoading: carregandoImagem } = usePlantaUrl(planta?.arquivo_path)
  const { data: grades = [] } = useGrades(plantaId)

  // Todas as grades da planta são carregadas juntas: o mapa mostra a obra
  // inteira de uma vez, como a prancha do AutoCAD, em vez de uma disciplina por
  // vez.
  const gradeIds = useMemo(() => grades.map((g) => g.id), [grades])
  const { data: segmentos = [] } = useSegmentosDeVariasGrades(gradeIds)
  const { data: status = [] } = useStatusDeVariasGrades(gradeIds)
  const { data: celulas = [] } = useCelulasDeVariasGrades(gradeIds)

  const [gradeId, setGradeId] = useState<string | null>(null)
  const gradeAtiva = grades.find((g) => g.id === gradeId) ?? grades[0] ?? null

  const [modo, setModo] = useState<ModoMapa>('apontar')
  const [statusSelecionadoId, setStatusSelecionadoId] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [editandoCores, setEditandoCores] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const segmentosDaGrade = useMemo(
    () => segmentos.filter((s) => s.grade_id === gradeAtiva?.id),
    [segmentos, gradeAtiva?.id],
  )
  const statusDaGrade = useMemo(
    () => status.filter((s) => s.grade_id === gradeAtiva?.id).sort((a, b) => a.ordem - b.ordem),
    [status, gradeAtiva?.id],
  )

  const [segmentoEditandoId, setSegmentoEditandoId] = useState<string | null>(null)
  const segmentoEditando =
    segmentosDaGrade.find((s) => s.id === segmentoEditandoId) ?? segmentosDaGrade[0] ?? null

  const [rascunho, setRascunho] = useState<Partial<MapaSegmento> | null>(null)
  const [pontosExtremos, setPontosExtremos] = useState<PontoImagem[]>([])

  const marcar = useMarcarCelulas(gradeAtiva?.id)
  const atualizarGrade = useAtualizarGrade(plantaId)
  const atualizarCrop = useAtualizarCrop(organizacaoId, currentProject?.id)
  const excluirGrade = useExcluirGrade(plantaId)
  const criarSegmento = useCriarSegmento(gradeAtiva?.id)
  const atualizarSegmento = useAtualizarSegmento(gradeAtiva?.id)
  const excluirSegmento = useExcluirSegmento(gradeAtiva?.id)
  const atualizarFiltro = useAtualizarFiltroVisual(organizacaoId, currentProject?.id)
  const atualizarStatus = useAtualizarStatus(gradeAtiva?.id)

  /** Uma camada por grade, com a calibração em andamento aplicada. */
  const camadas: CamadaGrade[] = useMemo(
    () =>
      grades.map((g) => ({
        grade: g,
        segmentos: segmentos
          .filter((s) => s.grade_id === g.id)
          .map((s) => (rascunho && s.id === segmentoEditando?.id ? { ...s, ...rascunho } : s)),
        status: status.filter((s) => s.grade_id === g.id),
      })),
    [grades, segmentos, status, rascunho, segmentoEditando?.id],
  )

  // Ao trocar de grade, o status selecionado do catálogo anterior não existe
  // mais — cai no primeiro que gera avanço (ordem >= 1).
  useEffect(() => {
    const primeiro = statusDaGrade.find((s) => s.ordem >= 1)
    setStatusSelecionadoId(primeiro?.id ?? statusDaGrade[0]?.id ?? null)
  }, [statusDaGrade])

  const pintura = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of celulas) m.set(chaveCelula(c.segmento_id, c.linha, c.coluna), c.status_id)
    return m
  }, [celulas])

  /** Avanço de cada grade — todas aparecem na legenda, não só a que está em foco. */
  const avancos = useMemo(
    () =>
      grades.map((g) => ({
        grade: g,
        status: status.filter((s) => s.grade_id === g.id).sort((a, b) => a.ordem - b.ordem),
        avanco: calcularAvanco(
          {
            segmentos: segmentos
              .filter((s) => s.grade_id === g.id)
              .map((s) => ({ id: s.id, colunas: s.colunas, linhas: s.linhas })),
            quantidadeTotal: g.quantidade_total,
            unidade: g.unidade,
          },
          status.filter((s) => s.grade_id === g.id),
          celulas.filter((c) => c.grade_id === g.id),
        ),
      })),
    [grades, segmentos, status, celulas],
  )

  const nomeArquivo = `mapa-${planta?.nome ?? 'planta'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  async function exportar(formato: 'pdf' | 'png' | 'compartilhar') {
    const node = exportRef.current
    if (!node) return
    setExportando(true)
    try {
      if (formato === 'pdf') await downloadNodeAsPdf(node, `${nomeArquivo}.pdf`)
      else if (formato === 'png') await downloadNodeAsPng(node, `${nomeArquivo}.png`, '#ffffff')
      else await shareNodeAsPng(node, `${nomeArquivo}.png`, planta?.nome ?? 'Mapa de avanço')
    } catch (err) {
      toast.error(`Não foi possível exportar: ${err instanceof Error ? err.message : err}`)
    } finally {
      setExportando(false)
    }
  }

  function marcarPonto(p: PontoImagem) {
    if (!segmentoEditando) return
    const pontos = [...pontosExtremos, p]
    if (pontos.length < 2) {
      setPontosExtremos(pontos)
      return
    }
    const base = { ...segmentoEditando, ...rascunho }
    const calib = calibrarPorExtremos(
      pontos[0],
      pontos[1],
      base.colunas,
      base.linhas,
      { largura: base.largura_celula, altura: base.altura_celula },
      { x: base.passo_x, y: base.passo_y },
    )
    setRascunho((prev) => ({ ...prev, ...calib }))
    setPontosExtremos([])
    setModo('calibrar')
    toast.success('Fileira ajustada — confira e salve')
  }

  async function handlePintar(refs: CelulaRef[]) {
    if (!organizacaoId || !statusSelecionadoId) return
    try {
      await marcar.mutateAsync({
        organizacaoId,
        celulas: refs,
        statusId: statusSelecionadoId,
        usuarioId: user?.id,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(
        /row-level security|violates/i.test(msg)
          ? 'Seu nível de acesso em Engenharia não permite apontar.'
          : `Não foi possível salvar: ${msg}`,
      )
    }
  }

  async function adicionarFileira() {
    if (!gradeAtiva || !organizacaoId) return
    const base = segmentoEditando
    try {
      const id = await criarSegmento.mutateAsync({
        organizacao_id: organizacaoId,
        grade_id: gradeAtiva.id,
        nome: `Fileira ${segmentosDaGrade.length + 1}`,
        offset_x: base ? base.offset_x : 100,
        offset_y: base ? base.offset_y + base.passo_y * base.linhas + 20 : 100,
        largura_celula: base?.largura_celula ?? 14,
        altura_celula: base?.altura_celula ?? 14,
        passo_x: base?.passo_x ?? 40,
        passo_y: base?.passo_y ?? 40,
        colunas: base?.colunas ?? 10,
        linhas: 1,
        ordem: segmentosDaGrade.length,
      })
      setSegmentoEditandoId(id)
      setRascunho(null)
      setModo('calibrar')
      toast.success('Fileira criada — calibre a posição dela')
    } catch (err) {
      toast.error(`Não foi possível criar: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (carregandoPlantas) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Carregando…
      </div>
    )
  }

  if (!planta) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-muted-foreground">
          Planta não encontrada nesta obra. Ela pode ter sido excluída, ou pertencer a outro projeto.
        </p>
        <Button asChild variant="outline">
          <Link to="/dashboard/gestao-vista">
            <ArrowLeft size={15} className="mr-1" /> Voltar
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard/gestao-vista">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{planta.nome}</h1>
            <p className="text-xs text-muted-foreground">
              {grades.length} grade(s) nesta planta · {planta.largura_natural}×
              {planta.altura_natural}px
            </p>
          </div>
        </div>
        {podeEditar && (
          <NovaGradeDialog
            organizacaoId={organizacaoId}
            projetoId={currentProject?.id}
            plantaId={planta.id}
            onCriada={(id) => {
              setGradeId(id)
              setSegmentoEditandoId(null)
            }}
          />
        )}
      </header>

      {podeEditar && (
        <Card className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={modo === 'apontar' ? 'default' : 'outline'} onClick={() => setModo('apontar')}>
              <MousePointerClick size={15} className="mr-1" /> Apontamento
            </Button>
            <Button
              size="sm"
              variant={modo === 'calibrar' ? 'default' : 'outline'}
              onClick={() => setModo('calibrar')}
              disabled={!gradeAtiva}
            >
              <Ruler size={15} className="mr-1" /> Calibrar
            </Button>
            <Button size="sm" variant={modo === 'recorte' ? 'default' : 'outline'} onClick={() => setModo('recorte')}>
              <Crop size={15} className="mr-1" /> Recortar planta
            </Button>

            <div className="flex items-center gap-1 ml-2">
              <Palette size={14} className="text-muted-foreground" />
              <Combobox
                options={FILTROS.map((f) => ({ value: f.valor, label: f.label }))}
                value={planta.filtro_visual}
                onChange={async (v) => {
                  if (!v) return
                  await atualizarFiltro.mutateAsync({
                    plantaId: planta.id,
                    filtro: v as MapaPlanta['filtro_visual'],
                  })
                }}
                allowClear={false}
                className="w-44"
              />
            </div>

            {modo === 'marcar-extremos' && (
              <span className="text-xs font-medium text-blue-600 ml-2">
                {pontosExtremos.length === 0
                  ? 'Clique no CENTRO do primeiro elemento desta fileira.'
                  : 'Agora clique no CENTRO do último elemento dela.'}
              </span>
            )}

            {modo === 'recorte' && (
              <>
                <span className="text-xs text-muted-foreground ml-2">
                  Arraste sobre a planta para escolher a área visível.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={async () => {
                    await atualizarCrop.mutateAsync({
                      plantaId: planta.id,
                      crop: { x: 0, y: 0, w: planta.largura_natural, h: planta.altura_natural },
                    })
                    toast.success('Recorte removido')
                  }}
                >
                  <Undo2 size={15} className="mr-1" /> Ver planta inteira
                </Button>
              </>
            )}
          </div>

          {(modo === 'apontar' || modo === 'calibrar') && grades.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">
                {modo === 'apontar' ? 'Apontando em:' : 'Calibrando:'}
              </span>
              {grades.map((g) => (
                <Button
                  key={g.id}
                  size="sm"
                  variant={gradeAtiva?.id === g.id ? 'default' : 'outline'}
                  onClick={() => {
                    setGradeId(g.id)
                    setSegmentoEditandoId(null)
                    setRascunho(null)
                  }}
                >
                  {g.nome}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground">
                (as outras seguem visíveis no mapa — clique numa delas para trocar o foco)
              </span>
            </div>
          )}

          {modo === 'apontar' && statusDaGrade.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
              <span className="text-xs text-muted-foreground">Marcar como:</span>
              {statusDaGrade.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStatusSelecionadoId(s.id)}
                  className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${
                    statusSelecionadoId === s.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={{ borderColor: s.cor_hex }}
                >
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.cor_hex }} />
                  {s.label}
                </button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setEditandoCores(true)} title="Editar cores e nomes">
                <Palette size={14} />
              </Button>
            </div>
          )}
        </Card>
      )}

      {modo === 'calibrar' && gradeAtiva && (
        <>
          <Card className="p-3 flex flex-wrap items-center gap-2">
            <Rows3 size={15} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fileiras de {gradeAtiva.nome}:</span>
            {segmentosDaGrade.map((s, i) => (
              <Button
                key={s.id}
                size="sm"
                variant={segmentoEditando?.id === s.id ? 'default' : 'outline'}
                onClick={() => {
                  setSegmentoEditandoId(s.id)
                  setRascunho(null)
                }}
              >
                {s.nome ?? `Fileira ${i + 1}`}
                <span className="ml-1 opacity-60">
                  ({s.colunas}×{s.linhas})
                </span>
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={adicionarFileira}>
              <Plus size={14} className="mr-1" /> Nova fileira
            </Button>
            <span className="text-xs text-muted-foreground w-full">
              Estacas no perímetro? Faça uma fileira por face — todas somam no mesmo percentual.
            </span>
          </Card>

          {segmentoEditando && (
            <PainelCalibracao
              valores={{ ...segmentoEditando, ...rascunho }}
              segmentoSalvo={segmentoEditando}
              grade={gradeAtiva}
              podeExcluirFileira={segmentosDaGrade.length > 1}
              onChange={(campos) => setRascunho((prev) => ({ ...prev, ...campos }))}
              onCalibrarClicando={() => {
                setPontosExtremos([])
                setModo('marcar-extremos')
              }}
              onSalvar={async (campos, camposGrade) => {
                await atualizarSegmento.mutateAsync({ id: segmentoEditando.id, ...campos })
                if (camposGrade) await atualizarGrade.mutateAsync({ id: gradeAtiva.id, ...camposGrade })
                setRascunho(null)
                toast.success('Calibração salva')
              }}
              onExcluirFileira={async () => {
                await excluirSegmento.mutateAsync(segmentoEditando.id)
                setSegmentoEditandoId(null)
                setRascunho(null)
                toast.success('Fileira excluída')
              }}
              onExcluirGrade={async () => {
                await excluirGrade.mutateAsync(gradeAtiva.id)
                setGradeId(null)
                setSegmentoEditandoId(null)
                setRascunho(null)
                setModo('apontar')
                toast.success('Grade excluída')
              }}
            />
          )}
        </>
      )}

      {/* Tudo que entra na exportação vive dentro deste bloco. */}
      <div ref={exportRef} className="space-y-4 bg-background p-3 rounded-md">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <h2 className="font-semibold">
            {currentProject?.nome} · {planta.nome}
          </h2>
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('pt-BR')}
          </span>
        </div>

        {carregandoImagem || !imagemUrl ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Abrindo a planta…
          </Card>
        ) : (
          <MapaViewport
            planta={planta}
            imagemUrl={imagemUrl}
            camadas={camadas}
            gradeAtivaId={podeEditar ? (gradeAtiva?.id ?? null) : null}
            pintura={pintura}
            modo={modo}
            statusSelecionadoId={statusSelecionadoId}
            podeEditar={podeEditar}
            onPintar={handlePintar}
            onFocarGrade={(id) => {
              setGradeId(id)
              setSegmentoEditandoId(null)
              setRascunho(null)
            }}
            onRecortar={async (crop) => {
              await atualizarCrop.mutateAsync({ plantaId: planta.id, crop })
              setModo('apontar')
              toast.success('Recorte aplicado')
            }}
            onMarcarPonto={marcarPonto}
            pontosMarcados={pontosExtremos}
          />
        )}

        {grades.length === 0 && (
          <Card className="p-8 text-center space-y-2">
            <p className="font-medium">Esta planta ainda não tem nenhuma grade.</p>
            <p className="text-sm text-muted-foreground">
              Crie uma grade para cada item que você acompanha (estacas, piso, dutos…). Todas
              aparecem juntas nesta página, cada uma com sua contagem.
            </p>
          </Card>
        )}

        {/* Uma legenda por grade, todas na mesma página. */}
        {avancos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {avancos.map(({ grade, status: st, avanco }) => (
              <Card
                key={grade.id}
                className={`p-3 space-y-2 ${gradeAtiva?.id === grade.id ? 'ring-1 ring-blue-500' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium text-sm">{grade.nome}</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {avanco.quantidadeTotal !== null
                      ? formatarQuantidade(avanco.quantidadeTotal, avanco.unidade)
                      : `${avanco.totalAtivo} un`}
                  </span>
                </div>

                {avanco.etapas.map((e) => (
                  <div key={e.ordem}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">{e.label}</span>
                      <span className="font-bold" style={{ color: e.cor_hex }}>
                        {formatarPct(e.pct)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.min(100, Math.max(0, e.pct))}%`,
                          backgroundColor: e.cor_hex,
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {e.quantidade !== null
                        ? `${formatarQuantidade(e.quantidade, avanco.unidade)} · ${e.concluidas}/${e.total}`
                        : `${e.concluidas}/${e.total}`}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t text-[10px] text-muted-foreground">
                  {st.map((s) => (
                    <span key={s.id} className="flex items-center gap-1">
                      <span
                        className={`h-2.5 w-2.5 border ${grade.forma === 'circulo' ? 'rounded-full' : 'rounded-sm'}`}
                        style={{
                          backgroundColor: s.conta_no_calculo ? s.cor_hex : 'transparent',
                          borderColor: s.cor_hex,
                        }}
                      />
                      {s.label}
                    </span>
                  ))}
                  {avanco.desativadas > 0 && <span>{avanco.desativadas} fora do cálculo</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {grades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => exportar('pdf')} disabled={exportando}>
            {exportando ? <Loader2 className="animate-spin mr-1" size={15} /> : <FileDown size={15} className="mr-1" />}
            Baixar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportar('png')} disabled={exportando}>
            <ImageDown size={15} className="mr-1" /> Baixar imagem
          </Button>
          {canShareFiles() && (
            <Button size="sm" variant="outline" onClick={() => exportar('compartilhar')} disabled={exportando}>
              <Share2 size={15} className="mr-1" /> Compartilhar
            </Button>
          )}
          <span className="text-xs text-muted-foreground self-center">
            Sai com o mapa e a legenda de todas as grades — pronto para o quadro.
          </span>
        </div>
      )}

      <EditorCoresDialog
        aberto={editandoCores}
        onFechar={() => setEditandoCores(false)}
        status={statusDaGrade}
        onSalvar={async (s) => {
          await atualizarStatus.mutateAsync(s)
        }}
      />
    </div>
  )
}

/**
 * Painel de calibração de UMA fileira — controlado pela página.
 *
 * Sem estado próprio para a geometria de propósito: a calibração assistida
 * (dois cliques na planta) escreve nos mesmos valores, e um estado local aqui
 * ficaria dessincronizado do que o mapa mostra.
 */
function PainelCalibracao({
  valores,
  segmentoSalvo,
  grade,
  podeExcluirFileira,
  onChange,
  onCalibrarClicando,
  onSalvar,
  onExcluirFileira,
  onExcluirGrade,
}: {
  valores: MapaSegmento
  segmentoSalvo: MapaSegmento
  grade: MapaGrade
  podeExcluirFileira: boolean
  onChange: (campos: Partial<MapaSegmento>) => void
  onCalibrarClicando: () => void
  onSalvar: (campos: Partial<MapaSegmento>, camposGrade?: Partial<MapaGrade>) => Promise<void>
  onExcluirFileira: () => Promise<void>
  onExcluirGrade: () => Promise<void>
}) {
  // Medida e forma são da GRADE (valem para todas as fileiras), não do segmento.
  const [medida, setMedida] = useState({
    quantidade: grade.quantidade_total?.toString() ?? '',
    unidade: grade.unidade ?? '',
  })
  const [forma, setForma] = useState<'retangulo' | 'circulo'>(grade.forma)

  useEffect(() => {
    setMedida({
      quantidade: grade.quantidade_total?.toString() ?? '',
      unidade: grade.unidade ?? '',
    })
    setForma(grade.forma)
  }, [grade])

  const camposGrade = (): Partial<MapaGrade> => {
    const q = medida.quantidade.trim()
    return {
      forma,
      quantidade_total: q ? Number(q.replace(',', '.')) : null,
      unidade: q ? medida.unidade.trim() || 'un' : null,
    }
  }

  const GEOMETRIA = [
    'offset_x', 'offset_y', 'largura_celula', 'altura_celula',
    'passo_x', 'passo_y', 'colunas', 'linhas',
  ] as const

  const alterouSegmento = GEOMETRIA.some((k) => valores[k] !== segmentoSalvo[k])
  const alterouGrade =
    forma !== grade.forma ||
    (medida.quantidade.trim() || null) !== (grade.quantidade_total?.toString() ?? null) ||
    (medida.unidade.trim() || null) !== (grade.unidade ?? null)
  const alterou = alterouSegmento || alterouGrade

  const campo = (chave: (typeof GEOMETRIA)[number], rotulo: string, min = 1) => (
    <div className="space-y-1">
      <Label className="text-xs">{rotulo}</Label>
      <Input
        type="number"
        min={min}
        step="any"
        value={valores[chave]}
        onChange={(e) => onChange({ [chave]: Number(e.target.value) })}
        className="w-24"
      />
    </div>
  )

  /** Move a fileira inteira sem mexer no passo — o ajuste fino do alinhamento. */
  const mover = (dx: number, dy: number) =>
    onChange({ offset_x: valores.offset_x + dx, offset_y: valores.offset_y + dy })

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onCalibrarClicando}>
          <Crosshair size={15} className="mr-1" /> Calibrar clicando na planta
        </Button>
        <span className="text-xs text-muted-foreground">
          Informe colunas e linhas desta fileira, clique aqui e marque o centro do primeiro e do
          último elemento. O resto é calculado.
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Forma (toda a grade)</Label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={forma === 'retangulo' ? 'default' : 'outline'}
              onClick={() => setForma('retangulo')}
              title="Praças, blocos, painéis"
            >
              <Square size={14} />
            </Button>
            <Button
              size="sm"
              variant={forma === 'circulo' ? 'default' : 'outline'}
              onClick={() => setForma('circulo')}
              title="Estacas, tubulões"
            >
              <Circle size={14} />
            </Button>
          </div>
        </div>

        {campo('colunas', 'Colunas')}
        {campo('linhas', 'Linhas')}
        {campo('largura_celula', 'Largura')}
        {campo('altura_celula', 'Altura')}
        {campo('passo_x', 'Passo X')}
        {campo('passo_y', 'Passo Y')}
        {campo('offset_x', 'Início X', 0)}
        {campo('offset_y', 'Início Y', 0)}

        <div className="space-y-1">
          <Label className="text-xs">Quantidade (toda a grade)</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min={0}
              step="any"
              value={medida.quantidade}
              onChange={(e) => setMedida((p) => ({ ...p, quantidade: e.target.value }))}
              placeholder="150"
              className="w-24"
            />
            <Input
              value={medida.unidade}
              onChange={(e) => setMedida((p) => ({ ...p, unidade: e.target.value }))}
              placeholder="un"
              className="w-16"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Mover fileira:</span>
          <Button size="sm" variant="outline" onClick={() => mover(-1, 0)} title="1px esquerda">
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(0, -1)} title="1px cima">
            <ChevronUp size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(0, 1)} title="1px baixo">
            <ChevronDown size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(1, 0)} title="1px direita">
            <ChevronRight size={14} />
          </Button>
          <span className="text-xs text-muted-foreground mx-1">10px:</span>
          <Button size="sm" variant="outline" onClick={() => mover(-10, 0)}>
            <ChevronsLeft size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(0, -10)}>
            <ChevronsUp size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(0, 10)}>
            <ChevronsDown size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(10, 0)}>
            <ChevronsRight size={14} />
          </Button>
        </div>

        <Button
          size="sm"
          onClick={() => {
            const { id: _id, grade_id: _g, organizacao_id: _o, ...geometria } = valores
            onSalvar(geometria, camposGrade())
          }}
          disabled={!alterou}
        >
          <Save size={15} className="mr-1" /> Salvar
        </Button>

        <div className="ml-auto flex gap-2">
          {podeExcluirFileira && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onExcluirFileira}>
              <Trash2 size={15} className="mr-1" /> Excluir fileira
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onExcluirGrade}>
            <Trash2 size={15} className="mr-1" /> Excluir grade
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O <strong>passo</strong> é a distância entre elementos e o <strong>tamanho</strong> é o
        desenho de cada um. Iguais = malha colada (piso); passo maior deixa o vão entre estacas.
        Nada é gravado até salvar.
      </p>
    </Card>
  )
}

/** Edita cor e nome das etapas já criadas. */
function EditorCoresDialog({
  aberto,
  onFechar,
  status,
  onSalvar,
}: {
  aberto: boolean
  onFechar: () => void
  status: MapaStatusRow[]
  onSalvar: (s: Partial<MapaStatusRow> & { id: string }) => Promise<void>
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cores e nomes das etapas</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {status.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="color"
                value={s.cor_hex}
                onChange={(e) => onSalvar({ id: s.id, cor_hex: e.target.value })}
                className="h-9 w-12 rounded border cursor-pointer bg-transparent"
                title="Cor"
              />
              <Input
                defaultValue={s.label}
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label && label !== s.label) onSalvar({ id: s.id, label })
                }}
                className="flex-1"
              />
              {!s.conta_no_calculo && (
                <Badge variant="outline" className="text-[10px] shrink-0">fora do cálculo</Badge>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            A cor muda na hora. O nome salva ao sair do campo.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Slug estável a partir do nome digitado — a chave precisa ser única na grade. */
function chaveDoNome(nome: string, indice: number): string {
  const base = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return base || `etapa_${indice}`
}

function NovaGradeDialog({
  organizacaoId,
  projetoId,
  plantaId,
  onCriada,
}: {
  organizacaoId: string | undefined
  projetoId: string | undefined
  plantaId: string
  onCriada: (id: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [novoGrupo, setNovoGrupo] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [forma, setForma] = useState<'retangulo' | 'circulo'>('retangulo')
  const [etapas, setEtapas] = useState<StatusInput[]>(MODELOS.personalizado.status)
  const [modeloAtual, setModeloAtual] = useState<string | null>(null)

  /** Aplicar um modelo troca etapas, forma e unidade de uma vez. */
  function aplicarModelo(chave: string) {
    const m = MODELOS[chave]
    if (!m) return
    setEtapas(m.status)
    setForma(m.forma)
    setUnidade(m.unidade)
    setModeloAtual(chave)
  }

  const { data: grupos = [] } = useGrupos(organizacaoId, projetoId)
  const criarGrupo = useCriarGrupo(organizacaoId, projetoId)
  const criar = useCriarGrade(organizacaoId, plantaId)

  function alterarEtapa(i: number, campos: Partial<StatusInput>) {
    setEtapas((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...campos } : e)))
  }

  function adicionarEtapa() {
    // Nasce como a próxima da escada, que é o caso comum.
    const proximaOrdem = Math.max(0, ...etapas.map((e) => e.ordem)) + 1
    setEtapas((prev) => [
      ...prev,
      {
        chave: `etapa_${prev.length}`,
        label: '',
        cor_hex: '#3b82f6',
        peso: 1,
        conta_no_calculo: true,
        ordem: proximaOrdem,
      },
    ])
  }

  const etapasValidas = etapas.filter((e) => e.label.trim())
  const temEstadoInicial = etapasValidas.some((e) => e.ordem === 0 && e.conta_no_calculo)
  const temEtapaDeAvanco = etapasValidas.some((e) => e.ordem >= 1)

  async function enviar() {
    if (!nome.trim() || !temEstadoInicial || !temEtapaDeAvanco) return
    try {
      let grupoFinal = grupoId
      if (novoGrupo.trim()) grupoFinal = await criarGrupo.mutateAsync(novoGrupo.trim())

      const id = await criar.mutateAsync({
        plantaId,
        grupoId: grupoFinal,
        nome: nome.trim(),
        // Valores de partida genéricos — a calibração fina acontece na tela,
        // com a planta à vista.
        offsetX: 100,
        offsetY: 100,
        larguraCelula: forma === 'circulo' ? 14 : 30,
        alturaCelula: forma === 'circulo' ? 14 : 30,
        // Estaca nasce espaçada (o vão entre elas é a regra); praça nasce colada.
        passoX: forma === 'circulo' ? 40 : 30,
        passoY: forma === 'circulo' ? 40 : 30,
        forma,
        colunas: 10,
        linhas: 1,
        quantidadeTotal: quantidade.trim() ? Number(quantidade.replace(',', '.')) : null,
        unidade: quantidade.trim() ? unidade.trim() || 'un' : null,
        status: etapasValidas.map((e, i) => ({
          ...e,
          label: e.label.trim(),
          chave: chaveDoNome(e.label, i),
        })),
      })
      toast.success('Grade criada — agora calibre a malha sobre a planta')
      onCriada(id)
      setAberto(false)
      setNome('')
      setNovoGrupo('')
      setGrupoId(null)
      setQuantidade('')
      setEtapas(MODELOS.personalizado.status)
      setModeloAtual(null)
    } catch (err) {
      toast.error(`Não foi possível criar: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus size={16} className="mr-1" /> Nova grade
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova grade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Estacas" />
            </div>

            <div className="space-y-1">
              <Label>Forma dos elementos</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={forma === 'retangulo' ? 'default' : 'outline'}
                  onClick={() => setForma('retangulo')}
                  className="flex-1"
                >
                  <Square size={15} className="mr-1" /> Retângulo
                </Button>
                <Button
                  type="button"
                  variant={forma === 'circulo' ? 'default' : 'outline'}
                  onClick={() => setForma('circulo')}
                  className="flex-1"
                >
                  <Circle size={15} className="mr-1" /> Círculo
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Modelo de mapeamento</Label>
              <Combobox
                options={Object.entries(MODELOS).map(([k, v]) => ({ value: k, label: v.label }))}
                value={modeloAtual}
                onChange={(v) => v && aplicarModelo(v)}
                placeholder="Escolha um modelo…"
                allowClear={false}
              />
              <p className="text-xs text-muted-foreground">
                {modeloAtual
                  ? MODELOS[modeloAtual].descricao
                  : 'Preenche etapas, forma e unidade. Tudo continua editável abaixo.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Etapas de avanço</Label>

              <div className="space-y-2 rounded border p-2">
                {etapas.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={e.cor_hex}
                      onChange={(ev) => alterarEtapa(i, { cor_hex: ev.target.value })}
                      className="h-9 w-10 rounded border cursor-pointer bg-transparent shrink-0"
                      title="Cor"
                    />
                    <Input
                      value={e.label}
                      onChange={(ev) => alterarEtapa(i, { label: ev.target.value })}
                      placeholder="Nome da etapa"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={9}
                      value={e.ordem}
                      onChange={(ev) => alterarEtapa(i, { ordem: Number(ev.target.value) })}
                      className="w-16"
                      title="0 = estado inicial; 1, 2, 3… = etapas que geram percentual"
                    />
                    <label className="flex items-center gap-1 text-xs shrink-0" title="Desmarque para tirar do cálculo (ex.: estaca cancelada)">
                      <Checkbox
                        checked={e.conta_no_calculo}
                        onCheckedChange={(v) => alterarEtapa(i, { conta_no_calculo: !!v })}
                      />
                      conta
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEtapas((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={etapas.length <= 2}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={adicionarEtapa}>
                  <Plus size={14} className="mr-1" /> Nova etapa
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                A coluna do número é a <strong>ordem</strong>: <strong>0</strong> é o estado inicial
                (não gera percentual) e <strong>1, 2, 3…</strong> são as etapas que aparecem na
                legenda, cada uma somando a anterior.
              </p>
              {!temEstadoInicial && (
                <p className="text-xs text-amber-600">
                  Falta uma etapa de ordem 0 — o estado em que tudo começa.
                </p>
              )}
              {!temEtapaDeAvanco && (
                <p className="text-xs text-amber-600">
                  Falta pelo menos uma etapa de ordem 1 ou mais, senão não há o que medir.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Quantidade que a grade representa (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="112"
                  className="flex-1"
                />
                <Input
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="un"
                  className="w-24"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ex.: 112 estacas, ou 150 m² de telhado. O avanço aparece nessa unidade além do
                percentual.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Grupo de avanço (opcional)</Label>
              <Combobox
                options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
                value={grupoId}
                onChange={setGrupoId}
                placeholder="Grade isolada — card próprio"
              />
              <Input
                value={novoGrupo}
                onChange={(e) => setNovoGrupo(e.target.value)}
                placeholder="…ou digite o nome de um grupo novo"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={enviar}
              disabled={!nome.trim() || !temEstadoInicial || !temEtapaDeAvanco || criar.isPending}
            >
              {criar.isPending && <Loader2 className="animate-spin mr-1" size={15} />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
