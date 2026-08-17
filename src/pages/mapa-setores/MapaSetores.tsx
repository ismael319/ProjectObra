import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MapPin,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import {
  usePlantasSetores,
  usePlantaSetoresUrl,
  useResumoSetores,
  useCriarPlantaSetor,
  useExcluirPlantaSetor,
  type MapaSetoresPlanta,
  type ResumoSetoresPlanta,
} from '@/lib/mapa-setores/mapa-setores-db'
import { ehPdf, contarPaginasPdf, pdfPaginaParaPng, medirImagem } from '@/lib/mapa-avanco/pdf-para-imagem'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function MapaSetores() {
  const { userProfile } = useAuth()
  const { podeEditar } = usePapelModulo('engenharia')
  const { currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const projetoId = currentProject?.id

  const { data: plantas = [], isLoading } = usePlantasSetores(organizacaoId, projetoId)
  const { data: resumoPorPlanta } = useResumoSetores(plantas.map((p) => p.id))
  const totalSetores = Array.from(resumoPorPlanta?.values() ?? []).reduce((total, resumo) => total + resumo.total, 0)

  if (!projetoId) {
    return (
      <div className="mx-auto max-w-xl p-4 pt-12 sm:p-6 sm:pt-20">
        <Card className="rounded-2xl border-border/70 p-8 text-center shadow-card">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin size={27} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Mapa de Setores</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Selecione uma obra em <span className="font-medium text-foreground">Meus Projetos</span> para consultar as plantas e seus setores.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 sm:p-6">
      <header className="flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <MapPin size={21} />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Building2 size={13} />
              {currentProject?.nome ?? 'Obra selecionada'}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mapa de Setores</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Organize as plantas da obra e acompanhe o avanço diretamente pelo cronograma.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ResumoHeader label="plantas" valor={plantas.length} icone={<Layers3 size={15} />} />
          <ResumoHeader label="setores" valor={resumoPorPlanta ? totalSetores : '—'} icone={<Pin size={15} />} />
          {podeEditar && <NovaPlantaDialog organizacaoId={organizacaoId} projetoId={projetoId} />}
        </div>
      </header>

      <section className="space-y-4">
        {isLoading && (
          <PlantasSkeleton />
        )}

        {!isLoading && plantas.length === 0 && (
          <Card className="rounded-2xl border-dashed border-border/90 bg-gradient-to-b from-card to-muted/30 px-6 py-12 text-center shadow-card sm:py-16">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ImageIcon size={30} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">A biblioteca de plantas está vazia</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Envie uma planta baixa em imagem ou PDF para posicionar os setores e acompanhar cada frente de serviço.
            </p>
            {podeEditar ? (
              <div className="mt-6 flex justify-center">
                <NovaPlantaDialog
                  organizacaoId={organizacaoId}
                  projetoId={projetoId}
                  className="shadow-md shadow-primary/20"
                  label="Enviar primeira planta"
                />
              </div>
            ) : (
              <p className="mt-5 text-xs text-muted-foreground">Peça a um usuário com permissão de edição para adicionar uma planta.</p>
            )}
          </Card>
        )}

        {!isLoading && plantas.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plantas.map((p) => (
              <PlantaCard
                key={p.id}
                planta={p}
                resumo={resumoPorPlanta?.get(p.id)}
                podeEditar={podeEditar}
                organizacaoId={organizacaoId}
                projetoId={projetoId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function NovaPlantaDialog({
  organizacaoId,
  projetoId,
  className,
  label = 'Nova planta',
}: {
  organizacaoId: string | undefined
  projetoId: string
  className?: string
  label?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [totalPaginas, setTotalPaginas] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [analisando, setAnalisando] = useState(false)
  const criar = useCriarPlantaSetor(organizacaoId, projetoId)
  const nomeInputId = useId()
  const arquivoInputId = useId()

  async function selecionarArquivo(f: File | null) {
    setArquivo(f)
    setTotalPaginas(0)
    setPagina(1)
    if (!f) return
    if (!nome.trim()) setNome(f.name.replace(/\.[^.]+$/, ''))
    if (!ehPdf(f)) return
    setAnalisando(true)
    try {
      setTotalPaginas(await contarPaginasPdf(f))
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
      <Button onClick={() => setAberto(true)} className={className}>
        <Plus size={16} className="mr-1" />
        {label}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b bg-muted/35 px-6 py-5">
            <DialogTitle className="text-xl tracking-tight">Adicionar planta</DialogTitle>
            <p className="pt-1 text-sm leading-5 text-muted-foreground">
              Envie uma prancha para organizar os setores desta obra.
            </p>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor={nomeInputId}>Nome da planta</Label>
              <Input
                id={nomeInputId}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Galpão de Biomassa"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={arquivoInputId}>Arquivo da planta</Label>
              <label
                htmlFor={arquivoInputId}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/25 px-5 py-7 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-card text-primary shadow-sm ring-1 ring-border transition-transform group-hover:-translate-y-0.5">
                  <Upload size={19} />
                </span>
                <span className="text-sm font-medium">Escolha uma imagem ou PDF</span>
                <span className="mt-1 text-xs text-muted-foreground">PNG, JPG, WEBP ou PDF</span>
              </label>
              <Input
                id={arquivoInputId}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
              {arquivo && (
                <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5 text-sm">
                  <FileText size={17} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-medium">{arquivo.name}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {ehPdf(arquivo) ? 'PDF' : arquivo.type.split('/')[1] ?? 'imagem'}
                  </span>
                </div>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Você poderá ajustar o recorte da área útil depois, dentro do mapa.
              </p>
            </div>

            {analisando && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={15} /> Lendo o PDF…
              </div>
            )}

            {totalPaginas > 1 && (
              <div className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 p-3">
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
          <DialogFooter className="border-t bg-muted/25 px-6 py-4">
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

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function ResumoHeader({ label, valor, icone }: { label: string; valor: number | string; icone: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-2 text-xs shadow-sm">
      <span className="text-primary">{icone}</span>
      <span className="font-semibold tabular-nums text-foreground">{valor}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function PlantasSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando plantas</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} aria-hidden="true" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="h-44 animate-pulse bg-muted/70" />
          <div className="space-y-4 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 p-3">
              <div className="h-8 animate-pulse rounded bg-muted/70" />
              <div className="h-8 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="h-9 animate-pulse rounded-lg bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PlantaCard({
  planta,
  resumo,
  podeEditar,
  organizacaoId,
  projetoId,
}: {
  planta: MapaSetoresPlanta
  resumo: ResumoSetoresPlanta | undefined
  podeEditar: boolean
  organizacaoId: string | undefined
  projetoId: string
}) {
  return (
    <Card className="group flex flex-col overflow-hidden rounded-2xl border-border/80 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-card-hover">
      <div className="relative">
        <PlantaThumb arquivoPath={planta.arquivo_path} nome={planta.nome} />
        <span className="absolute left-3 top-3 rounded-md border border-white/50 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-300">
          Planta
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight transition-colors group-hover:text-primary">{planta.nome}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Prancha de setores</p>
          </div>
          {podeEditar && <ExcluirPlantaBotao planta={planta} organizacaoId={organizacaoId} projetoId={projetoId} />}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Pin size={12} /> Setores
            </dt>
            <dd className="mt-1 truncate text-sm font-semibold tabular-nums">
              {resumo == null ? 'Carregando…' : `${resumo.total} ${resumo.total === 1 ? 'setor' : 'setores'}`}
            </dd>
          </div>
          <div className="min-w-0 border-l border-border/70 pl-3">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <CalendarDays size={12} /> Incluída em
            </dt>
            <dd className="mt-1 truncate text-sm font-semibold tabular-nums">{formatarData(planta.criado_em)}</dd>
          </div>
          <div className="col-span-2 flex items-center gap-1.5 border-t border-border/70 pt-2 text-xs text-muted-foreground">
            <RefreshCw size={12} className="shrink-0" />
            <dt className="sr-only">Última atualização</dt>
            <dd>{resumo?.ultimaAtualizacao ? `Atualizada em ${formatarData(resumo.ultimaAtualizacao)}` : 'Sem atualizações de setores'}</dd>
          </div>
        </dl>

        <Button asChild variant="outline" size="sm" className="mt-auto w-full justify-between border-border/80 bg-background px-3 hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
          <Link to={`/dashboard/mapa-setores/${planta.id}`}>
            <span>Abrir planta</span>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}

/** Baixa a planta só quando o card fica perto da viewport (a imagem pode ter vários MB) —
 * o cache em IndexedDB (usePlantaSetoresUrl) evita rebaixar a cada F5. */
function PlantaThumb({ arquivoPath, nome }: { arquivoPath: string; nome: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisivel(true)
          obs.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const { data: url, isPending } = usePlantaSetoresUrl(visivel ? arquivoPath : undefined)

  return (
    <div
      ref={ref}
      className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/70 p-3 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/35"
    >
      {url ? (
        <img
          src={url}
          alt={nome}
          loading="lazy"
          className="size-full object-contain transition-transform duration-500 group-hover:scale-[1.025]"
        />
      ) : visivel && isPending ? (
        <Loader2 className="animate-spin text-muted-foreground" size={19} />
      ) : (
        <ImageIcon size={27} className="text-muted-foreground/45" />
      )}
    </div>
  )
}

function ExcluirPlantaBotao({
  planta,
  organizacaoId,
  projetoId,
}: {
  planta: MapaSetoresPlanta
  organizacaoId: string | undefined
  projetoId: string
}) {
  const [aberto, setAberto] = useState(false)
  const excluir = useExcluirPlantaSetor(organizacaoId, projetoId)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="size-8 shrink-0 rounded-full p-0 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => setAberto(true)}
        aria-label={`Excluir planta ${planta.nome}`}
        title="Excluir planta"
      >
        <Trash2 size={15} className="text-destructive" />
      </Button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{planta.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os setores desta planta e os vínculos com o cronograma serão apagados junto. Não
              dá para desfazer.
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
