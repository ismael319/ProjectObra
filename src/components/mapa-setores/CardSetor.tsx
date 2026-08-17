import { Settings2 } from 'lucide-react'
import type { SetorComCamada, CamadaMapaId } from '@/lib/mapa-setores/camadas'
import type { EngenheiroDoSetor } from '@/lib/mapa-setores/progresso'
import ComparacaoAvanco from './ComparacaoAvanco'

interface Props {
  id: string
  nome: string
  cor: string
  xPct: number
  yPct: number
  zoom: number
  selecionado: boolean
  podeEditar: boolean
  resultadoCamada: { cor: string; valor: string } | undefined
  visual: SetorComCamada | undefined
  eng: EngenheiroDoSetor | undefined
  orfao: boolean
  onSelecionar: (id: string) => void
  onDragStart: (id: string, tipo: 'move-card', e: React.PointerEvent) => void
  onConfigurarCaixa: (id: string) => void
  onPropriedadesCard: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
}

export default function CardSetor({ id, nome, cor, xPct, yPct, zoom, selecionado, podeEditar, resultadoCamada, visual, eng, orfao, onSelecionar, onDragStart, onConfigurarCaixa, onPropriedadesCard, onContextMenu }: Props) {
  return (
    <div
      data-setor-interativo
      role="button"
      tabIndex={0}
      aria-selected={selecionado}
      className={`absolute z-20 min-w-[184px] max-w-[224px] rounded-xl border-2 bg-white/96 px-3 py-2.5 text-xs leading-relaxed shadow-elevated backdrop-blur-sm cursor-grab active:cursor-grabbing dark:bg-neutral-900/96 ${
        selecionado ? 'ring-4 ring-primary/20' : 'hover:shadow-lg'
      }`}
      style={{ left: `${xPct}%`, top: `${yPct}%`, borderColor: cor, transform: `scale(${1 / zoom})`, transformOrigin: 'top left' }}
      onPointerDown={(e) => { onSelecionar(id); onDragStart(id, 'move-card', e) }}
      onClick={() => onSelecionar(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelecionar(id) } }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (podeEditar) onContextMenu(id, e.clientX, e.clientY) }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs font-semibold uppercase tracking-wide" style={{ color: cor }}>
          <span className="block truncate">{nome}</span>
        </div>
        {podeEditar && <button
          type="button"
          data-setor-interativo
          aria-label={`Configurar ${nome}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPropriedadesCard(id) }}
        >
          <Settings2 size={13} />
        </button>}
      </div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: cor, borderColor: `${cor}55`, backgroundColor: `${cor}12` }}>
          {resultadoCamada?.valor ?? 'Sem dados'}
        </span>
        {orfao && <span className="font-medium text-amber-700" title="Alguma atividade vinculada não foi encontrada no cronograma atual">Vínculo</span>}
      </div>
      {visual && (
        <>
          <div className="mb-1.5 flex justify-between gap-2">
            <span className="text-muted-foreground">Realizado <b className="text-foreground">{visual.concluido != null ? `${visual.concluido.toFixed(0)}%` : '—'}</b></span>
            <span className="text-muted-foreground">Planejado <b className="text-foreground">{visual.previsto != null ? `${visual.previsto.toFixed(0)}%` : '—'}</b></span>
          </div>
          <ComparacaoAvanco previsto={visual.previsto} concluido={visual.concluido} cor={cor} className="mb-1.5" />
        </>
      )}
      {eng?.nome && (
        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eng.cor }} />
          {selecionado ? eng.nome : eng.nome.split(' ').slice(0, 2).join(' ')}
        </div>
      )}
      {!visual && <div className="text-muted-foreground">Configure os vínculos do setor</div>}
    </div>
  )
}
