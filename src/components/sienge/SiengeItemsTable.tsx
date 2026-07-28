import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ColunaConfig } from '@/lib/sienge/report-config'
import { STATUS_LABEL, type Anotacao, type ItemComClassificacao, type SiengeItem } from '@/lib/sienge/types'
import { CLASSIFICACAO_BADGE, CLASSIFICACAO_ROW, CLASSIFICACAO_TEXTO } from '@/lib/sienge/classify'
import { formatarMoeda, parseMoeda } from '@/lib/sienge/money'
import { valorColuna } from '@/lib/sienge/column-filters'
import SiengeAnnotationPopover from './SiengeAnnotationPopover'

interface Props {
  colunas: ColunaConfig[]
  colunasDetalhe: ColunaConfig[]
  itens: ItemComClassificacao[]
  onSalvarAnotacao: (chave: string, anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>) => Promise<void>
}

interface Ordenacao {
  coluna: ColunaConfig['key']
  asc: boolean
}

function valorExibicao(item: ItemComClassificacao, col: ColunaConfig): ReactNode {
  if (col.key === 'dias') {
    return (
      <div className="flex items-center gap-2">
        <span className={CLASSIFICACAO_TEXTO[item.classificacao.classe]}>{item.classificacao.dias}</span>
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

/** Valor comparável pra ordenação: dias/moeda viram número, o resto vira texto (minúsculo). */
function valorOrdenavel(item: ItemComClassificacao, col: ColunaConfig): number | string {
  if (col.key === 'dias') return item.classificacao.dias
  if (col.moeda) return parseMoeda(valorColuna(item, col.key))
  return valorColuna(item, col.key).toLowerCase()
}

function isoParaBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : dataISO
}

function ConteudoTooltip({ item, colunasDetalhe }: { item: ItemComClassificacao; colunasDetalhe: ColunaConfig[] }) {
  const detalhesComValor = colunasDetalhe.filter((col) => {
    const bruto = item[col.key as keyof SiengeItem]
    return bruto !== undefined && bruto !== null && String(bruto).trim() !== ''
  })
  const { anotacao } = item

  return (
    <div className="space-y-1">
      <p className="font-semibold text-foreground">
        {item.classificacao.label} · {item.classificacao.dias} dia(s)
      </p>
      {detalhesComValor.map((col) => (
        <p key={col.key}>
          <span className="font-medium">{col.label}:</span> {valorExibicao(item, col)}
        </p>
      ))}
      <p>
        <span className="font-medium">Status:</span> {STATUS_LABEL[anotacao.status] ?? 'Pendente'}
      </p>
      {anotacao.sinalizado && <p>🚩 Sinalizado para acompanhar</p>}
      {anotacao.lembreteData && <p>🔔 Lembrete: {isoParaBR(anotacao.lembreteData)}</p>}
      {anotacao.nota && (
        <p className="italic border-t pt-1 mt-1">
          "{anotacao.nota.length > 140 ? `${anotacao.nota.slice(0, 140)}…` : anotacao.nota}"
        </p>
      )}
    </div>
  )
}

export default function SiengeItemsTable({ colunas, colunasDetalhe, itens, onSalvarAnotacao }: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ coluna: 'dias', asc: false })

  function toggleExpandido(chave: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  function handleHeaderClick(col: ColunaConfig) {
    setOrdenacao((prev) => (prev.coluna === col.key ? { coluna: col.key, asc: !prev.asc } : { coluna: col.key, asc: false }))
  }

  // Ordena por urgência por padrão (dias decrescente) — quem precisa de decisão
  // mais urgente aparece primeiro, sem o usuário precisar clicar em nada.
  const itensOrdenados = useMemo(() => {
    const col = colunas.find((c) => c.key === ordenacao.coluna)
    if (!col) return itens
    return [...itens].sort((a, b) => {
      const va = valorOrdenavel(a, col)
      const vb = valorOrdenavel(b, col)
      if (va < vb) return ordenacao.asc ? -1 : 1
      if (va > vb) return ordenacao.asc ? 1 : -1
      return 0
    })
  }, [itens, colunas, ordenacao])

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
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {temDetalhe && <TableHead className="w-8" />}
              {colunas.map((col) => (
                <TableHead
                  key={col.key}
                  onClick={() => handleHeaderClick(col)}
                  className="cursor-pointer select-none hover:text-foreground transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {ordenacao.coluna === col.key &&
                      (ordenacao.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensOrdenados.map((item) => {
              const aberto = expandidos.has(item.chave)
              return (
                <Fragment key={item.chave}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TableRow
                        className={cn(
                          CLASSIFICACAO_ROW[item.classificacao.classe],
                          item.anotacao.status === 'resolvido' && 'opacity-60'
                        )}
                      >
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
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <ConteudoTooltip item={item} colunasDetalhe={colunasDetalhe} />
                    </TooltipContent>
                  </Tooltip>
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
    </TooltipProvider>
  )
}
