import { Maximize, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  zoom: number
  emTelaCheia: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onToggleFullScreen: () => void
}

export default function ToolbarZoom({ zoom, emTelaCheia, onZoomIn, onZoomOut, onFit, onToggleFullScreen }: Props) {
  return (
    <div className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-xl border border-border/80 bg-background/95 p-1 shadow-card backdrop-blur" data-setor-interativo>
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Reduzir zoom" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onZoomOut}><Minus size={15} /></button></TooltipTrigger><TooltipContent>Reduzir zoom</TooltipContent></Tooltip>
      <span className="min-w-10 text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Aumentar zoom" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onZoomIn}><Plus size={15} /></button></TooltipTrigger><TooltipContent>Aumentar zoom</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Ajustar planta à tela" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onFit}><Maximize size={15} /></button></TooltipTrigger><TooltipContent>Ajustar à tela</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label={emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'} className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onPointerDown={(e) => e.stopPropagation()} onClick={onToggleFullScreen}>{emTelaCheia ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></TooltipTrigger><TooltipContent>{emTelaCheia ? 'Sair da tela cheia' : 'Tela cheia'}</TooltipContent></Tooltip>
    </div>
  )
}
