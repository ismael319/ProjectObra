import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { criarFrente, criarItem, atualizarItem } from '@/lib/suprimentos/entrega-materiais/db'
import type { Frente, ItemLista } from '@/lib/suprimentos/entrega-materiais/types'

interface Props {
  open: boolean
  onClose: () => void
  projetoId: string
  organizacaoId: string
  frentes: Frente[]
  item: ItemLista | null
  onSaved: (frenteCriada?: Frente) => void
}

export default function EntregaMateriaisItemDialog({ open, onClose, projetoId, organizacaoId, frentes, item, onSaved }: Props) {
  const [frenteId, setFrenteId] = useState<string | null>(null)
  const [marcaConjunto, setMarcaConjunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dimensoes, setDimensoes] = useState('')
  const [qtdPlanejada, setQtdPlanejada] = useState('')
  const [pesoUnitarioKg, setPesoUnitarioKg] = useState('')
  const [novaFrenteNome, setNovaFrenteNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [criandoFrente, setCriandoFrente] = useState(false)

  useEffect(() => {
    if (!open) return
    setFrenteId(item?.frenteId ?? null)
    setMarcaConjunto(item?.marcaConjunto ?? '')
    setDescricao(item?.descricao ?? '')
    setDimensoes(item?.dimensoes ?? '')
    setQtdPlanejada(item ? String(item.qtdPlanejada) : '')
    setPesoUnitarioKg(item ? String(item.pesoUnitarioKg) : '')
    setNovaFrenteNome('')
  }, [open, item])

  async function handleCriarFrente() {
    const nome = novaFrenteNome.trim()
    if (!nome) return
    setCriandoFrente(true)
    try {
      const frente = await criarFrente({ projetoId, organizacaoId, nome })
      setFrenteId(frente.id)
      setNovaFrenteNome('')
      onSaved(frente)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar a frente.')
    } finally {
      setCriandoFrente(false)
    }
  }

  async function handleSalvar() {
    const qtd = Number(qtdPlanejada.replace(',', '.'))
    const peso = pesoUnitarioKg ? Number(pesoUnitarioKg.replace(',', '.')) : 0

    if (!frenteId) return toast.error('Selecione a frente.')
    if (!marcaConjunto.trim()) return toast.error('Informe a marca/conjunto.')
    if (!Number.isFinite(qtd) || qtd < 0) return toast.error('Quantidade planejada inválida.')
    if (!Number.isFinite(peso) || peso < 0) return toast.error('Peso unitário inválido.')

    setSalvando(true)
    try {
      if (item) {
        await atualizarItem(item.id, { frenteId, marcaConjunto: marcaConjunto.trim(), descricao: descricao.trim(), dimensoes: dimensoes.trim(), qtdPlanejada: qtd, pesoUnitarioKg: peso })
      } else {
        await criarItem({ projetoId, organizacaoId, frenteId, marcaConjunto: marcaConjunto.trim(), descricao: descricao.trim(), dimensoes: dimensoes.trim(), qtdPlanejada: qtd, pesoUnitarioKg: peso })
      }
      toast.success(item ? 'Item atualizado.' : 'Item criado.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar o item.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar peça' : 'Nova peça'}</DialogTitle>
          <DialogDescription>Peça da lista planejada de materiais.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Frente</Label>
            <Combobox
              options={frentes.map((f) => ({ value: f.id, label: f.nome }))}
              value={frenteId}
              onChange={setFrenteId}
              placeholder="Selecione a frente..."
              emptyText="Nenhuma frente cadastrada."
            />
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Ou crie uma frente nova"
                value={novaFrenteNome}
                onChange={(e) => setNovaFrenteNome(e.target.value)}
                className="text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleCriarFrente} disabled={!novaFrenteNome.trim() || criandoFrente}>
                <Plus size={14} className="mr-1" /> Criar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Marca/Conjunto</Label>
            <Input value={marcaConjunto} onChange={(e) => setMarcaConjunto(e.target.value)} placeholder="Ex: CTV2000" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição da peça" />
          </div>

          <div className="space-y-1.5">
            <Label>Dimensões</Label>
            <Input value={dimensoes} onChange={(e) => setDimensoes(e.target.value)} placeholder="Ex: 24 x 70 x 7640" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Qtd. planejada</Label>
              <Input value={qtdPlanejada} onChange={(e) => setQtdPlanejada(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Peso unitário (kg)</Label>
              <Input value={pesoUnitarioKg} onChange={(e) => setPesoUnitarioKg(e.target.value)} inputMode="decimal" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
