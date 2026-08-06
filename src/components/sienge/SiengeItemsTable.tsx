import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ColunaConfig } from '@/lib/sienge/report-config'
import { STATUS_LABEL, type Anotacao, type ItemComClassificacao, type SiengeItem } from '@/lib/sienge/types'
import { CLASSIFICACAO_BADGE, CLASSIFICACAO_ROW, CLASSIFICACAO_TEXTO, paraData } from '@/lib/sienge/classify'
import { formatarMoeda, parseMoeda } from '@/lib/sienge/money'
import { valorColuna } from '@/lib/sienge/column-filters'
import SiengeAnnotationPopover from './SiengeAnnotationPopover'

interface Props {
  colunas: ColunaConfig[]
  colunasDetalhe: ColunaConfig[]
  colunasVisiveis: Record<string, boolean>
  itens: ItemComClassificacao[]
  onSalvarAnotacao: (chave: string, anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>) => Promise<void>
}

interface Ordenacao {
  coluna: ColunaConfig['key']
  asc: boolean
}

const TAMANHO_PAGINA = 50

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
  if (col.filtro?.kind === 'data') {
    const data = paraData(valorColuna(item, col.key))
    return data ? data.getTime() : -Infinity
  }
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

export default function SiengeItemsTable({ colunas, colunasDetalhe, colunasVisiveis, itens, onSalvarAnotacao }: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ coluna: 'dias', asc: false })
  const [pagina, setPagina] = useState(0)

  const colunasRender = colunas.filter((c) => colunasVisiveis[c.key] !== false)
  const colunasDetalheRender = colunasDetalhe.filter((c) => colunasVisiveis[c.key] !== false)

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
    setPagina(0)
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

  const totalPaginas = Math.max(1, Math.ceil(itensOrdenados.length / TAMANHO_PAGINA))

  // Mantém a página válida quando os resultados mudam (filtro, busca, aba).
  useEffect(() => {
    setPagina((p) => Math.min(p, totalPaginas - 1))
  }, [totalPaginas])

  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const itensPagina = itensOrdenados.slice(paginaAtual * TAMANHO_PAGINA, (paginaAtual + 1) * TAMANHO_PAGINA)

  if (itens.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
        Nenhum item encontrado.
      </div>
    )
  }

  const temDetalhe = colunasDetalheRender.length > 0
  const totalColunas = colunasRender.length + (temDetalhe ? 1 : 0) + 1

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {temDetalhe && <TableHead className="w-8" />}
              {colunasRender.map((col) => (
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
            {itensPagina.map((item) => {
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
                        {colunasRender.map((col) => (
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
                      <ConteudoTooltip item={item} colunasDetalhe={colunasDetalheRender} />
                    </TooltipContent>
                  </Tooltip>
                  {aberto && temDetalhe && (
                    <TableRow>
                      <TableCell colSpan={totalColunas} className="bg-muted/30">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
                          {colunasDetalheRender.map((col) => (
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

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/80">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mostrando <span className="font-medium text-gray-700 dark:text-gray-200">{itensPagina.length ? paginaAtual * TAMANHO_PAGINA + 1 : 0}–{paginaAtual * TAMANHO_PAGINA + itensPagina.length}</span> de{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">{itensOrdenados.length}</span> itens
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={paginaAtual === 0}>
                <ChevronLeft size={14} /> Anterior
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
                {paginaAtual + 1} / {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                disabled={paginaAtual >= totalPaginas - 1}
              >
                Próxima <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
