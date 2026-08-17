import { Crop, MapPin, Square, X } from 'lucide-react'
import type { CamadaMapaId } from '@/lib/mapa-setores/camadas'
import type { ModoEdicao } from './PalcoSetores'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  modo: ModoEdicao
  camada: CamadaMapaId
  camadas: { id: CamadaMapaId; label: string; descricao: string }[]
  podeEditar: boolean
  onAlternarModo: (modo: Exclude<ModoEdicao, 'nenhum'>) => void
  onCamadaChange: (camada: CamadaMapaId) => void
}

export default function ToolbarEdicao({ modo, camada, camadas, podeEditar, onAlternarModo, onCamadaChange }: Props) {
  return (
    <div className="absolute left-3 top-3 z-40 flex flex-col items-stretch gap-1 rounded-xl border border-border/80 bg-background/95 p-1 shadow-card backdrop-blur sm:flex-row" data-setor-interativo>
      {podeEditar && <>
        <button type="button" aria-label="Criar setor por ponto" aria-pressed={modo === 'ponto'} title="Criar setor por ponto" className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${modo === 'ponto' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onAlternarModo('ponto')}>{modo === 'ponto' ? <X size={15} /> : <MapPin size={15} />}<span className="hidden text-xs font-medium sm:inline">Ponto</span></button>
        <button type="button" aria-label="Criar setor por área" aria-pressed={modo === 'area'} title="Criar setor por área" className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${modo === 'area' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onAlternarModo('area')}>{modo === 'area' ? <X size={15} /> : <Square size={15} />}<span className="hidden text-xs font-medium sm:inline">Área</span></button>
        <button type="button" aria-label="Definir visualização padrão" aria-pressed={modo === 'recorte'} title="Definir visualização padrão" className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${modo === 'recorte' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onAlternarModo('recorte')}>{modo === 'recorte' ? <X size={15} /> : <Crop size={15} />}<span className="hidden text-xs font-medium sm:inline">Recorte</span></button>
        <span className="hidden h-5 w-px self-center bg-border sm:block" />
      </>}
      <Select value={camada} onValueChange={(valor) => onCamadaChange(valor as CamadaMapaId)}>
        <SelectTrigger aria-label="Visualizar por" className="h-8 w-40 rounded-lg border-0 bg-transparent px-2 text-xs shadow-none" onPointerDown={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
        <SelectContent>{camadas.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
