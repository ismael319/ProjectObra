import type { ReactNode } from 'react'
import { AlertTriangle, Bell, Flag, PackageX } from 'lucide-react'
import type { ItemComClassificacao } from '@/lib/sienge/types'
import type { FiltroRapido } from '@/lib/sienge/column-filters'

interface Props {
  itens: ItemComClassificacao[]
  ativos: ReadonlySet<FiltroRapido>
  onToggle: (filtro: FiltroRapido) => void
}

interface Alerta {
  filtro: FiltroRapido
  rotulo: string
  icone: ReactNode
  contagem: number
  classesAtivo: string
  classesInativo: string
}

export default function SiengeBannerAlertas({ itens, ativos, onToggle }: Props) {
  const hojeISO = new Date().toISOString().slice(0, 10)

  const alertas: Alerta[] = [
    {
      filtro: 'sinalizado',
      rotulo: 'Sinalizados',
      icone: <Flag size={13} />,
      contagem: itens.filter((i) => i.anotacao.sinalizado).length,
      classesAtivo: 'bg-red-600 text-white border-red-600',
      classesInativo: 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30',
    },
    {
      filtro: 'lembrete',
      rotulo: 'Lembrete vencido',
      icone: <Bell size={13} />,
      contagem: itens.filter((i) => i.anotacao.lembreteData && i.anotacao.lembreteData <= hojeISO).length,
      classesAtivo: 'bg-amber-600 text-white border-amber-600',
      classesInativo: 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30',
    },
    {
      filtro: 'critico',
      rotulo: 'Críticos',
      icone: <AlertTriangle size={13} />,
      contagem: itens.filter((i) => i.classificacao.classe === 'critical').length,
      classesAtivo: 'bg-red-600 text-white border-red-600',
      classesInativo: 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30',
    },
    {
      filtro: 'nao_autorizado',
      rotulo: 'Não autorizados',
      icone: <PackageX size={13} />,
      contagem: itens.filter((i) => i.autorizado === false).length,
      classesAtivo: 'bg-orange-600 text-white border-orange-600',
      classesInativo: 'border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30',
    },
    {
      filtro: 'resolvido',
      rotulo: 'Resolvidos',
      icone: <span className="text-xs font-bold">✓</span>,
      contagem: itens.filter((i) => i.anotacao.status === 'resolvido').length,
      classesAtivo: 'bg-green-600 text-white border-green-600',
      classesInativo: 'border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30',
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Alertas ({itens.length} itens)
      </span>
      {alertas.map((a) => (
        <button
          key={a.filtro}
          type="button"
          onClick={() => onToggle(a.filtro)}
          disabled={a.contagem === 0}
          title={a.contagem === 0 ? 'Nenhum item nesta condição' : `Filtrar ${a.rotulo.toLocaleLowerCase()}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            ativos.has(a.filtro) ? a.classesAtivo : a.classesInativo
          }`}
        >
          {a.icone}
          {a.rotulo}
          <span className="font-bold">{a.contagem}</span>
        </button>
      ))}
    </div>
  )
}
