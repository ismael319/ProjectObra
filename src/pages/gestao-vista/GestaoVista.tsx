import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Map as MapIcon, Plus, Loader2, Image as ImageIcon, ArrowRight, Trash2 } from 'lucide-react'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import {
  usePlantas,
  useCriarPlanta,
  useExcluirPlanta,
  useGrupos,
  useGradesDoProjeto,
  useStatusDeVariasGrades,
  useCelulasDeVariasGrades,
  useSegmentosDeVariasGrades,
  type MapaPlanta,
} from '@/lib/mapa-avanco/mapa-db'
import { calcularAvanco, calcularAvancoGrupo, formatarPct, formatarQuantidade } from '@/lib/mapa-avanco/calculo'
import { ehPdf, contarPaginasPdf, pdfPaginaParaPng, medirImagem } from '@/lib/mapa-avanco/pdf-para-imagem'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function GestaoVista() {
  const { userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('engenharia')
  const { currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const projetoId = currentProject?.id

  const { data: plantas = [], isLoading } = usePlantas(organizacaoId, projetoId)
  const { data: grupos = [] } = useGrupos(organizacaoId, projetoId)

  const plantaIds = useMemo(() => plantas.map((p) => p.id), [plantas])
  const { data: grades = [] } = useGradesDoProjeto(organizacaoId, plantaIds)
  const gradeIds = useMemo(() => grades.map((g) => g.id), [grades])
  const { data: status = [] } = useStatusDeVariasGrades(gradeIds)
  const { data: celulas = [] } = useCelulasDeVariasGrades(gradeIds)
  const { data: segmentos = [] } = useSegmentosDeVariasGrades(gradeIds)

  // Avanço de cada grade, calculado uma vez e reaproveitado nos dois tipos de card.
  const avancoPorGrade = useMemo(() => {
    const m = new Map<string, ReturnType<typeof calcularAvanco>>()
    for (const g of grades) {
      m.set(
        g.id,
        calcularAvanco(
          {
            // O total vem dos segmentos: uma grade de estacas no perímetro tem
            // uma fileira por face, e todas contam no mesmo percentual.
            segmentos: segmentos
              .filter((s) => s.grade_id === g.id)
              .map((s) => ({ id: s.id, colunas: s.colunas, linhas: s.linhas })),
            quantidadeTotal: g.quantidade_total,
            unidade: g.unidade,
          },
          status.filter((s) => s.grade_id === g.id),
          celulas.filter((c) => c.grade_id === g.id),
        ),
      )
    }
    return m
  }, [grades, status, celulas, segmentos])

  const cardsGrupo = useMemo(
    () =>
      grupos
        .map((grupo) => {
          const membros = grades.filter((g) => g.grupo_id === grupo.id)
          const avancos = membros.map((g) => avancoPorGrade.get(g.id)!).filter(Boolean)
          return { grupo, membros, consolidado: calcularAvancoGrupo(avancos) }
        })
        .filter((c) => c.membros.length > 0),
    [grupos, grades, avancoPorGrade],
  )

  const gradesIsoladas = useMemo(() => grades.filter((g) => !g.grupo_id), [grades])

  if (!projetoId) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-xl font-semibold mb-2">Gestão à Vista</h1>
        <p className="text-muted-foreground">
          Selecione uma obra em <span className="font-medium">Meus Projetos</span> para ver os mapas
          de avanço dela.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MapIcon size={24} className="text-blue-600" />
            Gestão à Vista
          </h1>
          <p className="text-sm text-muted-foreground">
            Mapas de avanço sobre a planta: marque as praças executadas e o percentual sai sozinho.
          </p>
        </div>
        {podeEditar && <NovaPlantaDialog organizacaoId={organizacaoId} projetoId={projetoId} />}
      </header>

      {(cardsGrupo.length > 0 || gradesIsoladas.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cardsGrupo.map(({ grupo, membros, consolidado }) => (
            <Card key={grupo.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">{grupo.nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {membros.length} grade(s) · {consolidado.totalAtivo} un
                  </p>
                </div>
                <Badge variant="secondary">grupo</Badge>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {formatarPct(consolidado.pctPonderado)}
              </div>
              {consolidado.quantidadeTotal !== null && (
                <p className="text-sm text-muted-foreground">
                  {formatarQuantidade(consolidado.quantidadeConcluida, consolidado.unidade)} de{' '}
                  {formatarQuantidade(consolidado.quantidadeTotal, consolidado.unidade)}
                </p>
              )}
              <Barra pct={consolidado.pctPonderado} />
            </Card>
          ))}

          {gradesIsoladas.map((g) => {
            const a = avancoPorGrade.get(g.id)
            if (!a) return null
            return (
              <Card key={g.id} className="p-4 space-y-2">
                <div>
                  <h2 className="font-medium">{g.nome}</h2>
                  <p className="text-xs text-muted-foreground">
                    {a.quantidadeTotal !== null
                      ? formatarQuantidade(a.quantidadeTotal, a.unidade)
                      : `${a.totalAtivo} un`}
                    {a.desativadas > 0 && ` · ${a.desativadas} fora do cálculo`}
                  </p>
                </div>
                {a.etapas.length > 0 ? (
                  <div className="space-y-1.5">
                    {a.etapas.map((e) => (
                      <div key={e.ordem}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-muted-foreground">{e.label}</span>
                          <span className="font-semibold">{formatarPct(e.pct)}</span>
                        </div>
                        <Barra pct={e.pct} cor={e.cor_hex} />
                        <div className="text-[11px] text-muted-foreground">
                          {e.quantidade !== null
                            ? `${formatarQuantidade(e.quantidade, a.unidade)} · ${e.concluidas}/${e.total}`
                            : `${e.concluidas}/${e.total} un`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem etapas configuradas.</p>
                )}
              </Card>
            )
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Plantas</h2>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Carregando…
          </div>
        )}

        {!isLoading && plantas.length === 0 && (
          <Card className="p-8 text-center space-y-2">
            <ImageIcon size={32} className="mx-auto text-muted-foreground" />
            <p className="font-medium">Nenhuma planta cadastrada nesta obra.</p>
            <p className="text-sm text-muted-foreground">
              Envie a planta exportada do AutoCAD (PNG ou JPG) e desenhe a grade por cima dela.
            </p>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plantas.map((p) => {
            const gradesDaPlanta = grades.filter((g) => g.planta_id === p.id)
            return (
              <Card key={p.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{p.nome}</h3>
                    <p className="text-xs text-muted-foreground">
                      {gradesDaPlanta.length === 0
                        ? 'Sem grades ainda'
                        : `${gradesDaPlanta.length} grade(s)`}
                    </p>
                  </div>
                  {podeEditar && <ExcluirPlantaBotao planta={p} organizacaoId={organizacaoId} projetoId={projetoId} />}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/dashboard/gestao-vista/${p.id}`}>
                    Abrir mapa
                    <ArrowRight size={15} className="ml-1" />
                  </Link>
                </Button>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Barra({ pct, cor }: { pct: number; cor?: string }) {
  return (
    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
      <div
        className="h-full rounded transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: cor ?? '#2563eb' }}
      />
    </div>
  )
}

function NovaPlantaDialog({
  organizacaoId,
  projetoId,
}: {
  organizacaoId: string | undefined
  projetoId: string
}) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [totalPaginas, setTotalPaginas] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [analisando, setAnalisando] = useState(false)
  const criar = useCriarPlanta(organizacaoId, projetoId)

  async function selecionarArquivo(f: File | null) {
    setArquivo(f)
    setTotalPaginas(0)
    setPagina(1)
    if (!f || !ehPdf(f)) return
    // Prancha de obra costuma vir num PDF com várias folhas; sem saber quantas
    // são, não dá para oferecer a escolha.
    setAnalisando(true)
    try {
      setTotalPaginas(await contarPaginasPdf(f))
      if (!nome.trim()) setNome(f.name.replace(/\.pdf$/i, ''))
    } catch {
      toast.error('Não foi possível ler este PDF.')
      setArquivo(null)
    } finally {
      setAnalisando(false)
    }
  }

  async function enviar() {
    if (!arquivo || !nome.trim()) return
    try {
      // As dimensões precisam sair daqui: são elas que definem o sistema de
      // coordenadas de todo o resto (recorte e posição das células).
      const { blob, extensao, largura, altura } = ehPdf(arquivo)
        ? await (async () => {
            const r = await pdfPaginaParaPng(arquivo, pagina)
            return { blob: r.blob, extensao: 'png', largura: r.largura, altura: r.altura }
          })()
        : await (async () => {
            const d = await medirImagem(arquivo)
            return {
              blob: arquivo,
              extensao: arquivo.name.split('.').pop()?.toLowerCase() ?? 'png',
              largura: d.largura,
              altura: d.altura,
            }
          })()

      await criar.mutateAsync({
        nome: nome.trim(),
        blob,
        extensao,
        larguraNatural: largura,
        alturaNatural: altura,
      })
      toast.success('Planta enviada')
      setAberto(false)
      setNome('')
      setArquivo(null)
      setTotalPaginas(0)
    } catch (err) {
      toast.error(`Não foi possível enviar: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus size={16} className="mr-1" />
        Nova planta
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova planta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Armazém 2 — Piso e Aerações"
              />
            </div>
            <div className="space-y-1">
              <Label>Arquivo da planta (PDF, PNG ou JPG)</Label>
              <Input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Pode enviar o PDF direto do AutoCAD — a página escolhida vira imagem no envio. O
                recorte e o zoom você ajusta depois, dentro do mapa.
              </p>
            </div>

            {analisando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={15} /> Lendo o PDF…
              </div>
            )}

            {totalPaginas > 1 && (
              <div className="space-y-1">
                <Label>Página da prancha ({totalPaginas} no arquivo)</Label>
                <Input
                  type="number"
                  min={1}
                  max={totalPaginas}
                  value={pagina}
                  onChange={(e) =>
                    setPagina(Math.min(totalPaginas, Math.max(1, Number(e.target.value))))
                  }
                  className="w-28"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={!arquivo || !nome.trim() || criar.isPending || analisando}>
              {criar.isPending && <Loader2 className="animate-spin mr-1" size={15} />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ExcluirPlantaBotao({
  planta,
  organizacaoId,
  projetoId,
}: {
  planta: MapaPlanta
  organizacaoId: string | undefined
  projetoId: string
}) {
  const [aberto, setAberto] = useState(false)
  const excluir = useExcluirPlanta(organizacaoId, projetoId)

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)} title="Excluir planta">
        <Trash2 size={15} className="text-destructive" />
      </Button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{planta.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as grades desta planta e todo o apontamento delas serão apagados junto. Não dá
              para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                try {
                  await excluir.mutateAsync(planta)
                  toast.success('Planta excluída')
                  setAberto(false)
                } catch (err) {
                  toast.error(`Não foi possível excluir: ${err instanceof Error ? err.message : err}`)
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
