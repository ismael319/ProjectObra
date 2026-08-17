import type { ItemLegendaCamada } from '@/lib/mapa-setores/camadas'

interface Props {
  legenda: ItemLegendaCamada[]
}

export default function LegendaMapa({ legenda }: Props) {
  return (
    <div className="absolute bottom-3 left-3 z-40 max-w-[calc(100%-1.5rem)] rounded-xl border border-border/70 bg-background/92 px-3 py-2 shadow-card backdrop-blur" data-setor-interativo>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Visualizar por</p>
      <div className="flex max-w-72 flex-wrap gap-x-2.5 gap-y-1">
        {legenda.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: item.cor }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
