import type { MapaSetoresMarcador } from '@/lib/mapa-setores/mapa-setores-db'

interface Props {
  marcador: MapaSetoresMarcador & { area_x_pct: number; area_y_pct: number; area_w_pct: number; area_h_pct: number }
  cor: string
  zoom: number
  selecionado: boolean
  podeEditar: boolean
  onSelecionar: (id: string) => void
  onDragStart: (id: string, tipo: 'move-area' | 'resize-area', e: React.PointerEvent) => void
}

export default function MarcadorArea({ marcador, cor, zoom, selecionado, podeEditar, onSelecionar, onDragStart }: Props) {
  return (
    <div
      className="absolute z-10"
      style={{ left: `${marcador.area_x_pct}%`, top: `${marcador.area_y_pct}%`, width: `${marcador.area_w_pct}%`, height: `${marcador.area_h_pct}%` }}
    >
      <div
        data-setor-interativo
        tabIndex={0}
        role="button"
        aria-label={marcador.nome}
        onPointerDown={(e) => { onSelecionar(marcador.id); onDragStart(marcador.id, 'move-area', e) }}
        onClick={() => onSelecionar(marcador.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelecionar(marcador.id) } }}
        className={`absolute inset-0 rounded-md border-2 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary/50 ${selecionado ? 'ring-4 ring-primary/25 shadow-lg' : ''}`}
        style={{ borderColor: cor, backgroundColor: `${cor}22` }}
      />
      <div
        className="absolute -left-2 -top-2 w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none"
        style={{ backgroundColor: cor, transform: `scale(${1 / zoom})`, transformOrigin: 'center' }}
      />
      {podeEditar && (
        <div
          data-setor-interativo
          onPointerDown={(e) => { onSelecionar(marcador.id); onDragStart(marcador.id, 'resize-area', e) }}
          className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border-2 rounded-sm cursor-nwse-resize"
          style={{ borderColor: cor, transform: `scale(${1 / zoom})`, transformOrigin: 'center' }}
        />
      )}
    </div>
  )
}
