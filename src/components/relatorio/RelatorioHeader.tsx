// Cabeçalho compartilhado dos relatórios visuais (Fechamento/Programação por área e
// Programação semanal por engenheiro) — mesma faixa azul-marinho nos dois.
//
// Cores em style inline (não classes Tailwind) de propósito: ver paleta.ts.
import { COR } from './paleta'

interface Props {
  codigo: string
  nomeProjeto: string
  gestor?: string
  tipo: string
  dataLabel: string
}

export default function RelatorioHeader({ codigo, nomeProjeto, gestor, tipo, dataLabel }: Props) {
  return (
    <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: COR.navy, color: COR.white }}>
      <p className="text-xs font-medium tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>
        {codigo} · {nomeProjeto}
        {gestor ? ` · Gestor: ${gestor.toUpperCase()}` : ''}
      </p>
      <h1 className="text-2xl font-bold mt-1">{tipo}</h1>
      <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{dataLabel}</p>
    </div>
  )
}
