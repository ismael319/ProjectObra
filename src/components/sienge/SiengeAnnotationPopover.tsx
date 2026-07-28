import { useState } from 'react'
import { Bell, Flag, StickyNote } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { STATUS_LABEL, type Anotacao } from '@/lib/sienge/types'

const STATUS_OPCOES = (Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((valor) => ({
  valor,
  rotulo: STATUS_LABEL[valor],
}))

interface Props {
  anotacao: Anotacao
  onSave: (anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>) => Promise<void>
}

export default function SiengeAnnotationPopover({ anotacao, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(anotacao.status)
  const [nota, setNota] = useState(anotacao.nota)
  const [lembrete, setLembrete] = useState(anotacao.lembreteData ?? '')
  const [sinalizado, setSinalizado] = useState(anotacao.sinalizado)
  const [salvando, setSalvando] = useState(false)

  function handleOpenChange(v: boolean) {
    if (v) {
      setStatus(anotacao.status)
      setNota(anotacao.nota)
      setLembrete(anotacao.lembreteData ?? '')
      setSinalizado(anotacao.sinalizado)
    }
    setOpen(v)
  }

  async function handleSalvar() {
    setSalvando(true)
    try {
      await onSave({ status, nota, lembreteData: lembrete || null, sinalizado })
      setOpen(false)
    } finally {
      setSalvando(false)
    }
  }

  const hojeISO = new Date().toISOString().slice(0, 10)
  const lembreteVencido = Boolean(anotacao.lembreteData && anotacao.lembreteData <= hojeISO)
  const temAlgo = anotacao.sinalizado || Boolean(anotacao.nota) || anotacao.status !== 'pendente' || Boolean(anotacao.lembreteData)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded p-1.5 hover:bg-muted transition-colors ${
            temAlgo ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'
          }`}
          title="Status, nota e lembrete"
        >
          {anotacao.sinalizado && <Flag size={15} className="text-red-500 dark:text-red-400" />}
          {lembreteVencido && <Bell size={15} className="text-amber-500 dark:text-amber-400" />}
          {!anotacao.sinalizado && !lembreteVencido && <StickyNote size={16} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <div className="flex gap-1">
            {STATUS_OPCOES.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setStatus(opcao.valor)}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  status === opcao.valor
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input text-gray-600 dark:text-gray-300 hover:bg-muted'
                }`}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sienge-lembrete">Lembrete</Label>
          <input
            id="sienge-lembrete"
            type="date"
            value={lembrete}
            onChange={(e) => setLembrete(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="sienge-sinalizado">Sinalizar para acompanhar</Label>
          <Switch id="sienge-sinalizado" checked={sinalizado} onCheckedChange={setSinalizado} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sienge-nota">Nota</Label>
          <Textarea
            id="sienge-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="Escreva uma observação sobre este item..."
          />
        </div>

        <Button onClick={handleSalvar} disabled={salvando} className="w-full" size="sm">
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
