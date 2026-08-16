interface Props {
  previsto: number | null
  concluido: number | null
  cor: string
  className?: string
}

function limitarPercentual(valor: number | null) {
  return Math.max(0, Math.min(100, valor ?? 0))
}

export default function ComparacaoAvanco({ previsto, concluido, cor, className }: Props) {
  const realizado = limitarPercentual(concluido)
  const planejado = previsto == null ? null : limitarPercentual(previsto)
  const descricao = `Realizado ${concluido == null ? 'sem dados' : `${concluido.toFixed(0)}%`}; planejado ${previsto == null ? 'sem dados' : `${previsto.toFixed(0)}%`}`

  return (
    <div className={className} role="img" aria-label={descricao}>
      <div className="relative h-2 overflow-visible rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${realizado}%`, backgroundColor: cor }} />
        {planejado != null && (
          <span
            className="absolute top-[-3px] h-3.5 w-0.5 rounded-full bg-foreground/75"
            style={{ left: `${planejado}%` }}
            title={`Planejado: ${planejado.toFixed(0)}%`}
          />
        )}
      </div>
    </div>
  )
}
