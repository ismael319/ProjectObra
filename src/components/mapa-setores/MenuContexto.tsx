import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  marcadorId: string
  onConfigurarCaixa: (id: string) => void
  onPropriedadesCard: (id: string) => void
  onFechar: () => void
}

export default function MenuContexto({ x, y, marcadorId, onConfigurarCaixa, onPropriedadesCard, onFechar }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.focus()
  }, [])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Ações do setor"
      tabIndex={-1}
      className="fixed z-50 bg-white dark:bg-neutral-900 border rounded-md shadow-lg py-1 min-w-[180px] text-sm outline-none"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onFechar() }}
    >
      <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { onConfigurarCaixa(marcadorId); onFechar() }}>
        Configurar caixa
      </button>
      <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { onPropriedadesCard(marcadorId); onFechar() }}>
        Propriedades do card
      </button>
    </div>
  )
}
