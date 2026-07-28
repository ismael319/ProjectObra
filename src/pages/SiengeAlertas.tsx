import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { REPORT_CONFIGS } from '@/lib/sienge/report-config'
import { aplicarFiltrosColuna, type FiltroValor } from '@/lib/sienge/column-filters'
import { itensAtuais, listarAnotacoes, listarImportacoes, salvarAnotacao, type Importacao } from '@/lib/sienge/db'
import { classificarItem } from '@/lib/sienge/classify'
import { ANOTACAO_PADRAO, type Anotacao, type ItemComClassificacao, type TipoRelatorio } from '@/lib/sienge/types'
import SiengeStatsCards from '@/components/sienge/SiengeStatsCards'
import SiengeItemsTable from '@/components/sienge/SiengeItemsTable'
import SiengeColumnFilters from '@/components/sienge/SiengeColumnFilters'
import SiengeUploadModal from '@/components/sienge/SiengeUploadModal'
import SiengeImportHistoryDialog from '@/components/sienge/SiengeImportHistoryDialog'

const TIPOS: TipoRelatorio[] = ['solicitacoes', 'pedidos', 'contratos']

export default function SiengeAlertas() {
  const { user, userProfile } = useAuth()
  const { currentProject } = useProjects()

  const [tipoAtivo, setTipoAtivo] = useState<TipoRelatorio>('solicitacoes')
  const [itensPorTipo, setItensPorTipo] = useState<Partial<Record<TipoRelatorio, ItemComClassificacao[]>>>({})
  const [ultimaImportacaoPorTipo, setUltimaImportacaoPorTipo] = useState<Partial<Record<TipoRelatorio, Importacao | null>>>({})
  const [carregando, setCarregando] = useState(false)
  const [filtros, setFiltros] = useState<Record<string, FiltroValor>>({})
  const [uploadAberto, setUploadAberto] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [recarregarChave, setRecarregarChave] = useState(0)

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

  useEffect(() => {
    setFiltros({})
    void carregarTipo(tipoAtivo)
  }, [tipoAtivo, carregarTipo, recarregarChave])

  const config = REPORT_CONFIGS[tipoAtivo]
  const itensBrutos = itensPorTipo[tipoAtivo] ?? []
  const ultimaImportacao = ultimaImportacaoPorTipo[tipoAtivo]

  // Cards de estatística seguem o mesmo critério do app original: todos os itens
  // do tipo, exceto os que o usuário já marcou manualmente como "resolvido" —
  // filtros de coluna não afetam os números dos cards.
  const itensParaStats = useMemo(() => itensBrutos.filter((i) => i.anotacao.status !== 'resolvido'), [itensBrutos])
  const itensFiltrados = useMemo(
    () => aplicarFiltrosColuna(itensBrutos, config.colunas, filtros),
    [itensBrutos, config.colunas, filtros]
  )

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
                <SiengeStatsCards stats={config.stats} itens={itensParaStats} />
                <SiengeColumnFilters colunas={config.colunas} itens={itensBrutos} filtros={filtros} onChange={setFiltros} />
                {carregando ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Carregando...</p>
                ) : (
                  <SiengeItemsTable
                    colunas={config.colunas}
                    colunasDetalhe={config.colunasDetalhe}
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
