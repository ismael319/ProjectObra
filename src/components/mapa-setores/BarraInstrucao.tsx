import { X } from 'lucide-react'

interface Props {
  texto: string
  onCancelar: () => void
}

export default function BarraInstrucao({ texto, onCancelar }: Props) {
  return (
    <div className="absolute bottom-3 left-1/2 z-40 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-primary/20 bg-background/95 px-3 py-2 text-xs shadow-card backdrop-blur" data-setor-interativo>
      <span className="size-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
      <span className="truncate">{texto}</span>
      <button type="button" className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onPointerDown={(e) => e.stopPropagation()} onClick={onCancelar} aria-label="Cancelar modo de edição">
        <X size={14} />
      </button>
    </div>
  )
}
