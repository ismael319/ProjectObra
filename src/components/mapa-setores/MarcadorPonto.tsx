import type { MapaSetoresMarcador } from '@/lib/mapa-setores/mapa-setores-db'

interface Props {
  marcador: MapaSetoresMarcador & { pos_x_pct: number; pos_y_pct: number }
  cor: string
  zoom: number
  selecionado: boolean
  onSelecionar: (id: string) => void
  onDragStart: (id: string, tipo: 'move-point', e: React.PointerEvent) => void
}

export default function MarcadorPonto({ marcador, cor, zoom, selecionado, onSelecionar, onDragStart }: Props) {
  return (
    <div
      className="absolute z-10"
      style={{ left: `${marcador.pos_x_pct}%`, top: `${marcador.pos_y_pct}%`, transform: 'translate(-50%, -100%)' }}
    >
      <div
        data-setor-interativo
        tabIndex={0}
        role="button"
        aria-label={marcador.nome}
        onPointerDown={(e) => { onSelecionar(marcador.id); onDragStart(marcador.id, 'move-point', e) }}
        onClick={() => onSelecionar(marcador.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelecionar(marcador.id) } }}
        className={`w-4 h-4 rounded-full border-2 border-white shadow cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary/50 ${selecionado ? 'ring-4 ring-primary/35' : ''}`}
        style={{ backgroundColor: cor, transform: `scale(${1 / zoom})`, transformOrigin: '50% 100%' }}
      />
    </div>
  )
}
