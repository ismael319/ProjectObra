import { Fragment, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { ColunaConfig } from '@/lib/sienge/report-config'
import type { Anotacao, ItemComClassificacao, SiengeItem } from '@/lib/sienge/types'
import { CLASSIFICACAO_BADGE } from '@/lib/sienge/classify'
import { formatarMoeda, parseMoeda } from '@/lib/sienge/money'
import SiengeAnnotationPopover from './SiengeAnnotationPopover'

interface Props {
  colunas: ColunaConfig[]
  colunasDetalhe: ColunaConfig[]
  itens: ItemComClassificacao[]
  onSalvarAnotacao: (chave: string, anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>) => Promise<void>
}

function valorExibicao(item: ItemComClassificacao, col: ColunaConfig): ReactNode {
  if (col.key === 'dias') {
    return (
      <div className="flex items-center gap-2">
        <span>{item.classificacao.dias}</span>
        <Badge variant="outline" className={CLASSIFICACAO_BADGE[item.classificacao.classe]}>
          {item.classificacao.label}
        </Badge>
      </div>
    )
  }

  if (col.key === 'autorizado') {
    return item.autorizado ? (
      'Sim'
    ) : (
      <span className="text-red-600 dark:text-red-400 font-semibold">NÃO AUTORIZADO</span>
    )
  }

  const bruto = item[col.key as keyof SiengeItem]
  const texto = typeof bruto === 'boolean' ? (bruto ? 'Sim' : 'Não') : String(bruto ?? '')

  if (col.moeda) return formatarMoeda(parseMoeda(texto))
  if (col.comUnidade) return [texto, item.unidade].filter(Boolean).join(' ')
  return texto || '—'
}

export default function SiengeItemsTable({ colunas, colunasDetalhe, itens, onSalvarAnotacao }: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  function toggleExpandido(chave: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  if (itens.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
        Nenhum item encontrado.
      </div>
    )
  }

  const temDetalhe = colunasDetalhe.length > 0
  const totalColunas = colunas.length + (temDetalhe ? 1 : 0) + 1

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {temDetalhe && <TableHead className="w-8" />}
            {colunas.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => {
            const aberto = expandidos.has(item.chave)
            return (
              <Fragment key={item.chave}>
                <TableRow className={item.anotacao.status === 'resolvido' ? 'opacity-60' : undefined}>
                  {temDetalhe && (
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleExpandido(item.chave)}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </TableCell>
                  )}
                  {colunas.map((col) => (
                    <TableCell key={col.key}>{valorExibicao(item, col)}</TableCell>
                  ))}
                  <TableCell>
                    <SiengeAnnotationPopover
                      anotacao={item.anotacao}
                      onSave={(anotacao) => onSalvarAnotacao(item.chave, anotacao)}
                    />
                  </TableCell>
                </TableRow>
                {aberto && temDetalhe && (
                  <TableRow>
                    <TableCell colSpan={totalColunas} className="bg-muted/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
                        {colunasDetalhe.map((col) => (
                          <div key={col.key}>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{col.label}</p>
                            <p className="text-sm text-gray-900 dark:text-white">{valorExibicao(item, col)}</p>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
