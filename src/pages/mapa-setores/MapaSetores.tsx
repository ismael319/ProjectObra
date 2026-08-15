import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MapPin, Plus, Loader2, Image as ImageIcon, ArrowRight, Trash2 } from 'lucide-react'
import { useAuth, usePapelModulo } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import {
  usePlantasSetores,
  useCriarPlantaSetor,
  useExcluirPlantaSetor,
  type MapaSetoresPlanta,
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

  if (!projetoId) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-xl font-semibold mb-2">Mapa de Setores</h1>
        <p className="text-muted-foreground">
          Selecione uma obra em <span className="font-medium">Meus Projetos</span> para ver os mapas
          de setores dela.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MapPin size={24} className="text-blue-600" />
            Mapa de Setores
          </h1>
          <p className="text-sm text-muted-foreground">
            Setores posicionados livremente sobre a planta, com avanço vindo direto do cronograma.
          </p>
        </div>
        {podeEditar && <NovaPlantaDialog organizacaoId={organizacaoId} projetoId={projetoId} />}
      </header>

      <section className="space-y-3">
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
              Envie a planta baixa (imagem ou PDF) e posicione os setores por cima dela.
            </p>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plantas.map((p) => (
            <Card key={p.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{p.nome}</h3>
                </div>
                {podeEditar && <ExcluirPlantaBotao planta={p} organizacaoId={organizacaoId} projetoId={projetoId} />}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/mapa-setores/${p.id}`}>
                  Abrir mapa
                  <ArrowRight size={15} className="ml-1" />
                </Link>
              </Button>
            </Card>
          ))}
        </div>
      </section>
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
  const criar = useCriarPlantaSetor(organizacaoId, projetoId)

  async function selecionarArquivo(f: File | null) {
    setArquivo(f)
    setTotalPaginas(0)
    setPagina(1)
    if (!f || !ehPdf(f)) return
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
                placeholder="Galpão de Biomassa"
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
                O recorte da área útil da planta você ajusta depois, dentro do mapa.
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
  planta: MapaSetoresPlanta
  organizacaoId: string | undefined
  projetoId: string
}) {
  const [aberto, setAberto] = useState(false)
  const excluir = useExcluirPlantaSetor(organizacaoId, projetoId)

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
