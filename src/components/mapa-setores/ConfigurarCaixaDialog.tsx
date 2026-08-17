import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { useAtualizarMarcador, useExcluirMarcador, type MapaSetoresMarcador } from '@/lib/mapa-setores/mapa-setores-db'
import { clamp } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function isValidHex(value: string) {
  return !value || HEX_RE.test(value)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plantaId: string
  marcador: MapaSetoresMarcador
  container?: HTMLElement
}

/** Edição precisa (números) do que o arraste no mapa já faz visualmente — útil quando o
 * mouse não é preciso o bastante. Não mexe em cronograma/campos, isso é
 * "Propriedades do card" (o outro item do menu de botão direito). */
export default function ConfigurarCaixaDialog({ open, onOpenChange, plantaId, marcador, container }: Props) {
  const [nome, setNome] = useState(marcador.nome)
  const [posX, setPosX] = useState(marcador.pos_x_pct ?? 0)
  const [posY, setPosY] = useState(marcador.pos_y_pct ?? 0)
  const [areaX, setAreaX] = useState(marcador.area_x_pct ?? 0)
  const [areaY, setAreaY] = useState(marcador.area_y_pct ?? 0)
  const [areaW, setAreaW] = useState(marcador.area_w_pct ?? 10)
  const [areaH, setAreaH] = useState(marcador.area_h_pct ?? 10)
  const [cardX, setCardX] = useState(marcador.card_x_pct)
  const [cardY, setCardY] = useState(marcador.card_y_pct)
  const [cor, setCor] = useState(marcador.cor ?? '')
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  const atualizar = useAtualizarMarcador(plantaId)
  const excluir = useExcluirMarcador(plantaId)

  useEffect(() => {
    if (!open) return
    setNome(marcador.nome)
    setPosX(marcador.pos_x_pct ?? 0)
    setPosY(marcador.pos_y_pct ?? 0)
    setAreaX(marcador.area_x_pct ?? 0)
    setAreaY(marcador.area_y_pct ?? 0)
    setAreaW(marcador.area_w_pct ?? 10)
    setAreaH(marcador.area_h_pct ?? 10)
    setCardX(marcador.card_x_pct)
    setCardY(marcador.card_y_pct)
    setCor(marcador.cor ?? '')
  }, [open, marcador])

  async function salvar() {
    if (!nome.trim()) {
      toast.error('Dê um nome ao setor.')
      return
    }
    if (!isValidHex(cor)) {
      toast.error('Cor inválida. Use formato #fff ou #123456.')
      return
    }
    try {
      await atualizar.mutateAsync({
        id: marcador.id,
        nome: nome.trim(),
        ...(marcador.tipo === 'ponto'
          ? { pos_x_pct: clamp(posX, 0, 100), pos_y_pct: clamp(posY, 0, 100) }
          : {
              area_x_pct: clamp(areaX, 0, 100),
              area_y_pct: clamp(areaY, 0, 100),
              area_w_pct: clamp(areaW, 1, 100),
              area_h_pct: clamp(areaH, 1, 100),
            }),
        card_x_pct: clamp(cardX, 0, 100),
        card_y_pct: clamp(cardY, 0, 100),
        cor: cor || null,
      })
      toast.success('Setor atualizado')
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err))
      console.error('[ConfigurarCaixaDialog] salvar error:', err)
      toast.error(`Não foi possível salvar: ${msg}`)
    }
  }

  const PRESET_COR = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b', '#db2777']

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent container={container} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar caixa — {marcador.nome}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome do setor</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            {marcador.tipo === 'ponto' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Posição X (%)</Label>
                  <Input type="number" min={0} max={100} step={0.1} value={posX} onChange={(e) => setPosX(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Posição Y (%)</Label>
                  <Input type="number" min={0} max={100} step={0.1} value={posY} onChange={(e) => setPosY(Number(e.target.value))} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Posição X (%)</Label>
                  <Input type="number" min={0} max={100} step={0.1} value={areaX} onChange={(e) => setAreaX(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Posição Y (%)</Label>
                  <Input type="number" min={0} max={100} step={0.1} value={areaY} onChange={(e) => setAreaY(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Largura (%)</Label>
                  <Input type="number" min={1} max={100} step={0.1} value={areaW} onChange={(e) => setAreaW(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label>Altura (%)</Label>
                  <Input type="number" min={1} max={100} step={0.1} value={areaH} onChange={(e) => setAreaH(Number(e.target.value))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label>Card — posição X (%)</Label>
                <Input type="number" min={0} max={100} step={0.1} value={cardX} onChange={(e) => setCardX(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Card — posição Y (%)</Label>
                <Input type="number" min={0} max={100} step={0.1} value={cardY} onChange={(e) => setCardY(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label>Cor do setor</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={cor || '#64748b'} onChange={(e) => setCor(e.target.value)} className="size-8 cursor-pointer rounded-lg border border-border p-0" />
                <Input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="#64748b" pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$" className={`h-8 w-28 font-mono text-xs ${cor && !isValidHex(cor) ? 'border-destructive' : ''}`} />
                {cor && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCor('')}>
                    Limpar
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COR.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${cor === c ? 'border-foreground ring-2 ring-foreground/20' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setCor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" className="text-destructive mr-auto" onClick={() => setConfirmarExclusao(true)}>
              <Trash2 size={15} className="mr-1" />
              Excluir setor
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={atualizar.isPending}>
                {atualizar.isPending && <Loader2 className="animate-spin mr-1" size={15} />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent container={container}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{marcador.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O marcador e as propriedades do card serão apagados. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                try {
                  await excluir.mutateAsync(marcador.id)
                  toast.success('Setor excluído')
                  setConfirmarExclusao(false)
                  onOpenChange(false)
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
