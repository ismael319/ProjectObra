import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  History,
  Loader2,
  Search,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { REPORT_CONFIGS } from '@/lib/sienge/report-config'
import {
  aplicarBusca,
  aplicarFiltrosColuna,
  aplicarFiltrosRapidos,
  type FiltroRapido,
  type FiltroValor,
} from '@/lib/sienge/column-filters'
import { itensAtuais, listarAnotacoes, listarImportacoes, salvarAnotacao, type Importacao } from '@/lib/sienge/db'
import { classificarItem } from '@/lib/sienge/classify'
import { consolidadoEmAberto } from '@/lib/sienge/stats'
import { formatarMoeda } from '@/lib/sienge/money'
import { exportarItensXlsx } from '@/lib/sienge/excel-export'
import { ANOTACAO_PADRAO, type Anotacao, type ItemComClassificacao, type TipoRelatorio } from '@/lib/sienge/types'
import SiengeStatsCards from '@/components/sienge/SiengeStatsCards'
import SiengeItemsTable from '@/components/sienge/SiengeItemsTable'
import SiengeColumnFilters from '@/components/sienge/SiengeColumnFilters'
import SiengeUploadModal from '@/components/sienge/SiengeUploadModal'
import SiengeImportHistoryDialog from '@/components/sienge/SiengeImportHistoryDialog'
import SiengeBannerAlertas from '@/components/sienge/SiengeBannerAlertas'
import SiengeCharts from '@/components/sienge/SiengeCharts'

const TIPOS: TipoRelatorio[] = ['solicitacoes', 'pedidos', 'contratos']

export default function SiengeAlertas() {
  const { user, userProfile } = useAuth()
  const { currentProject } = useProjects()

  const [tipoAtivo, setTipoAtivo] = useState<TipoRelatorio>('solicitacoes')
  const [itensPorTipo, setItensPorTipo] = useState<Partial<Record<TipoRelatorio, ItemComClassificacao[]>>>({})
  const [ultimaImportacaoPorTipo, setUltimaImportacaoPorTipo] = useState<Partial<Record<TipoRelatorio, Importacao | null>>>({})
  const [carregando, setCarregando] = useState(false)
  const [filtros, setFiltros] = useState<Record<string, FiltroValor>>({})
  const [busca, setBusca] = useState('')
  const [filtrosRapidos, setFiltrosRapidos] = useState<ReadonlySet<FiltroRapido>>(new Set())
  const [colunasVisiveis, setColunasVisiveis] = useState<Record<string, boolean>>({})
  const [uploadAberto, setUploadAberto] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [recarregarChave, setRecarregarChave] = useState(0)
  const [visaoExecutivaAberta, setVisaoExecutivaAberta] = useState(true)
  const [exportando, setExportando] = useState(false)

  const projetoId = currentProject?.id
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const carregarTipo = useCallback(
    async (tipo: TipoRelatorio) => {
      if (!projetoId) return
      setCarregando(true)
      try {
        const [itens, anotacoes, importacoes] = await Promise.all([
          itensAtuais(projetoId, tipo),
          listarAnotacoes(projetoId, tipo),
          listarImportacoes(projetoId, tipo),
        ])
        const comClassificacao: ItemComClassificacao[] = itens.map((item) => ({
          ...item,
          classificacao: classificarItem(item, tipo),
          anotacao: anotacoes.get(item.chave) ?? ANOTACAO_PADRAO,
        }))
        setItensPorTipo((prev) => ({ ...prev, [tipo]: comClassificacao }))
        setUltimaImportacaoPorTipo((prev) => ({ ...prev, [tipo]: importacoes[0] ?? null }))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao carregar dados do Sienge.')
      } finally {
        setCarregando(false)
      }
    },
    [projetoId]
  )

  // Carrega os três tipos juntos (o consolidado da visão executiva usa pedidos + contratos).
  useEffect(() => {
    if (!projetoId) return
    TIPOS.forEach((tipo) => void carregarTipo(tipo))
  }, [projetoId, carregarTipo, recarregarChave])

  // Trocar de aba reinicia busca e filtros rápidos (os filtros de coluna também).
  useEffect(() => {
    setFiltros({})
    setBusca('')
    setFiltrosRapidos(new Set())
    setColunasVisiveis({})
  }, [tipoAtivo])

  const config = REPORT_CONFIGS[tipoAtivo]
  const itensBrutos = itensPorTipo[tipoAtivo] ?? []
  const ultimaImportacao = ultimaImportacaoPorTipo[tipoAtivo]

  // Cards de estatística seguem o mesmo critério do app original: todos os itens
  // do tipo, exceto os que o usuário já marcou manualmente como "resolvido" —
  // filtros de coluna não afetam os números dos cards.
  const itensParaStats = useMemo(() => itensBrutos.filter((i) => i.anotacao.status !== 'resolvido'), [itensBrutos])

  // Pipeline: filtros de coluna → busca global → filtros rápidos.
  const itensSemRapidos = useMemo(
    () => aplicarBusca(aplicarFiltrosColuna(itensBrutos, config.colunas, filtros), busca),
    [itensBrutos, config.colunas, filtros, busca]
  )
  const itensFiltrados = useMemo(() => aplicarFiltrosRapidos(itensSemRapidos, filtrosRapidos), [itensSemRapidos, filtrosRapidos])

  const consolidado = useMemo(() => {
    const pedidos = itensPorTipo.pedidos ?? []
    const contratos = itensPorTipo.contratos ?? []
    if (pedidos.length === 0 && contratos.length === 0) return null
    return consolidadoEmAberto(pedidos, contratos)
  }, [itensPorTipo])

  const todasColunas = useMemo(() => [...config.colunas, ...config.colunasDetalhe], [config])

  function toggleFiltroRapido(filtro: FiltroRapido) {
    setFiltrosRapidos((prev) => {
      const next = new Set(prev)
      if (next.has(filtro)) next.delete(filtro)
      else next.add(filtro)
      return next
    })
  }

  async function handleExportar() {
    if (itensFiltrados.length === 0 || !currentProject) return
    setExportando(true)
    try {
      await exportarItensXlsx({
        titulo: config.titulo,
        nomeArquivo: `${currentProject.nome.replace(/[^a-zA-Z0-9_-]/g, '_')}_${tipoAtivo}`,
        colunas: config.colunas,
        colunasDetalhe: config.colunasDetalhe,
        colunasVisiveis,
        itens: itensFiltrados,
      })
      toast.success(`Exportado ${itensFiltrados.length} ${itensFiltrados.length === 1 ? 'item' : 'itens'}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar a planilha.')
    } finally {
      setExportando(false)
    }
  }

  async function handleSalvarAnotacao(
    chave: string,
    anotacao: Pick<Anotacao, 'status' | 'nota' | 'lembreteData' | 'sinalizado'>
  ) {
    if (!projetoId || !organizacaoId) return
    await salvarAnotacao({ projetoId, organizacaoId, userId: user?.id, tipo: tipoAtivo, chave, anotacao })
    setItensPorTipo((prev) => {
      const lista = prev[tipoAtivo]
      if (!lista) return prev
      return {
        ...prev,
        [tipoAtivo]: lista.map((item) =>
          item.chave === chave ? { ...item, anotacao: { ...anotacao, atualizadoEm: new Date().toISOString() } } : item
        ),
      }
    })
  }

  function handleImportado(tipo: TipoRelatorio) {
    setTipoAtivo(tipo)
    setRecarregarChave((k) => k + 1)
  }

  if (!currentProject) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        Selecione uma obra para ver os alertas do Sienge.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alertas Sienge</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{currentProject.nome}</p>
          {ultimaImportacao && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Último arquivo importado: <span className="font-medium">{ultimaImportacao.arquivoNome}</span> em{' '}
              {new Date(ultimaImportacao.importadoEm).toLocaleDateString('pt-BR')} ({ultimaImportacao.totalItens} itens)
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoricoAberto(true)}>
            <History size={16} /> Histórico
          </Button>
          <Button onClick={() => setUploadAberto(true)}>
            <Upload size={16} /> Importar arquivo
          </Button>
        </div>
      </div>

      {consolidado && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-4">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">Pedidos em aberto</p>
            <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-white">{formatarMoeda(consolidado.pedidos)}</p>
          </div>
          <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50 dark:bg-violet-950/30 p-4">
            <p className="text-xs font-medium text-violet-700 dark:text-violet-300 uppercase tracking-wide">Contratos em aberto</p>
            <p className="mt-1 text-2xl font-bold text-violet-900 dark:text-white">{formatarMoeda(consolidado.contratos)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total em aberto</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{formatarMoeda(consolidado.total)}</p>
          </div>
        </div>
      )}

      <Tabs value={tipoAtivo} onValueChange={(v) => setTipoAtivo(v as TipoRelatorio)}>
        <TabsList>
          {TIPOS.map((tipo) => (
            <TabsTrigger key={tipo} value={tipo}>
              {REPORT_CONFIGS[tipo].titulo}
            </TabsTrigger>
          ))}
        </TabsList>

        {TIPOS.map((tipo) => (
          <TabsContent key={tipo} value={tipo} className="space-y-4">
            {tipoAtivo === tipo && (
              <>
                <div className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setVisaoExecutivaAberta((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <BarChart3 size={16} className="text-blue-600 dark:text-blue-400" /> Visão executiva
                    </span>
                    {visaoExecutivaAberta ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </button>
                  {visaoExecutivaAberta && (
                    <div className="px-4 pb-4">
                      <SiengeCharts tipo={tipoAtivo} itens={itensBrutos} />
                    </div>
                  )}
                </div>

                <SiengeStatsCards stats={config.stats} itens={itensParaStats} />
                <SiengeColumnFilters colunas={config.colunas} itens={itensBrutos} filtros={filtros} onChange={setFiltros} />

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <SiengeBannerAlertas itens={itensSemRapidos} ativos={filtrosRapidos} onToggle={toggleFiltroRapido} />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <Input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar em todos os campos..."
                        className="pl-8 w-56"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Columns3 size={14} /> Colunas
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-60">
                        <div className="max-h-80 overflow-y-auto space-y-0.5">
                          {todasColunas.map((col) => {
                            const visivel = colunasVisiveis[col.key] !== false
                            return (
                              <button
                                key={col.key}
                                type="button"
                                onClick={() => setColunasVisiveis((prev) => ({ ...prev, [col.key]: !visivel }))}
                                className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <span className="truncate">{col.label}</span>
                                {visivel && <Check size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setColunasVisiveis({})}
                          className="mt-2 w-full rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Restaurar todas as colunas
                        </button>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="sm" onClick={handleExportar} disabled={itensFiltrados.length === 0 || exportando}>
                      {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar
                    </Button>
                  </div>
                </div>

                {carregando ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Carregando...</p>
                ) : (
                  <SiengeItemsTable
                    colunas={config.colunas}
                    colunasDetalhe={config.colunasDetalhe}
                    colunasVisiveis={colunasVisiveis}
                    itens={itensFiltrados}
                    onSalvarAnotacao={handleSalvarAnotacao}
                  />
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {projetoId && organizacaoId && (
        <SiengeUploadModal
          open={uploadAberto}
          onClose={() => setUploadAberto(false)}
          projetoId={projetoId}
          organizacaoId={organizacaoId}
          userId={user?.id}
          onImportado={handleImportado}
        />
      )}

      {projetoId && (
        <SiengeImportHistoryDialog
          open={historicoAberto}
          onClose={() => setHistoricoAberto(false)}
          projetoId={projetoId}
          tipo={tipoAtivo}
          onExcluida={() => setRecarregarChave((k) => k + 1)}
        />
      )}
    </div>
  )
}
