import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useCriarMarcador, type TipoMarcador } from '@/lib/mapa-setores/mapa-setores-db'
import type { NovaGeometria } from './PalcoSetores'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizacaoId: string
  plantaId: string
  geometria: NovaGeometria
  cardPos: { x: number; y: number }
}

/** Criação é só o nome — geometria já veio do clique/arraste na planta. Cronograma e os
 * 4 campos do card são configurados depois, com o botão direito no card ("Propriedades
 * do card"), porque um setor recém-desenhado ainda não tem por que já saber de qual
 * atividade ele trata. */
export default function NovoSetorDialog({ open, onOpenChange, organizacaoId, plantaId, geometria, cardPos }: Props) {
  const [nome, setNome] = useState('')
  const criar = useCriarMarcador(plantaId)

  async function salvar() {
    if (!nome.trim()) return
    try {
      await criar.mutateAsync({
        organizacaoId,
        plantaId,
        nome: nome.trim(),
        tipo: geometria.tipo as TipoMarcador,
        posXPct: geometria.tipo === 'ponto' ? geometria.posXPct : null,
        posYPct: geometria.tipo === 'ponto' ? geometria.posYPct : null,
        areaXPct: geometria.tipo === 'area' ? geometria.areaXPct : null,
        areaYPct: geometria.tipo === 'area' ? geometria.areaYPct : null,
        areaWPct: geometria.tipo === 'area' ? geometria.areaWPct : null,
        areaHPct: geometria.tipo === 'area' ? geometria.areaHPct : null,
        cardXPct: cardPos.x,
        cardYPct: cardPos.y,
      })
      toast.success('Setor criado — clique com o botão direito nele para configurar as atividades.')
      setNome('')
      onOpenChange(false)
    } catch (err) {
      toast.error(`Não foi possível criar: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo setor</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Nome do setor</Label>
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Casa de Máquinas"
            onKeyDown={(e) => e.key === 'Enter' && salvar()}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!nome.trim() || criar.isPending}>
            {criar.isPending && <Loader2 className="animate-spin mr-1" size={15} />}
            Criar setor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
