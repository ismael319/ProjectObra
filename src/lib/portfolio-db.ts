import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type StatusSemaforo = 'verde' | 'amarelo' | 'vermelho'
export type StatusGeralProjeto = 'planejamento' | 'em_andamento' | 'paralisado' | 'concluido'

export interface ProjetoKpis {
  avancoFisicoPct: number
  avancoPlanejadoPct: number
  desvioPct: number
  ppcUltimaSemana: number
  restricoesAbertas: number
  efetivoAtual: number
  ocorrenciasAbertas: number
  ocorrenciasCriticas: number
  statusSemaforo: StatusSemaforo
  dataSnapshot: string
}

export interface PortfolioProjeto {
  id: string
  nome: string
  cliente: string | null
  tipoObra: string | null
  /** Reaproveita projetos.localizacao (mesmo campo já usado na tela de
   * seleção de projetos) como "região" do filtro — não existe uma coluna de
   * região dedicada, e criar uma nova duplicaria esse dado. */
  regiao: string | null
  statusGeral: StatusGeralProjeto
  latitude: number | null
  longitude: number | null
  /** null = ainda não apareceu no snapshot (matview ainda não rodou pra esse
   * projeto, ex.: criado agora há pouco) — a tela trata como "sem dados". */
  kpis: ProjetoKpis | null
}

interface ProjetoRow {
  id: string
  nome: string
  cliente: string | null
  tipo_obra: string | null
  localizacao: string | null
  status_geral: string
  latitude: number | string | null
  longitude: number | string | null
}

interface KpiRow {
  projeto_id: string
  data_snapshot: string
  avanco_fisico_pct: number | string
  avanco_planejado_pct: number | string
  desvio_pct: number | string
  ppc_ultima_semana: number | string
  restricoes_abertas: number
  efetivo_atual: number
  ocorrencias_abertas: number
  ocorrencias_criticas: number
  status_semaforo: StatusSemaforo
}

function mapKpiRow(row: KpiRow | undefined): ProjetoKpis | null {
  if (!row) return null
  return {
    avancoFisicoPct: Number(row.avanco_fisico_pct),
    avancoPlanejadoPct: Number(row.avanco_planejado_pct),
    desvioPct: Number(row.desvio_pct),
    ppcUltimaSemana: Number(row.ppc_ultima_semana),
    restricoesAbertas: row.restricoes_abertas,
    efetivoAtual: row.efetivo_atual,
    ocorrenciasAbertas: row.ocorrencias_abertas,
    ocorrenciasCriticas: row.ocorrencias_criticas,
    statusSemaforo: row.status_semaforo,
    dataSnapshot: row.data_snapshot,
  }
}

// vw_projeto_kpis é uma VIEW comum por cima da materialized view
// projeto_kpis_snapshot (que não recebe RLS/GRANT direto — ver migration da
// Fase C) — PostgREST não detecta relacionamento automático com `projetos`
// por não haver FK numa view, então busca as duas em paralelo e junta aqui.
export function usePortfolioProjetos(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['portfolio-projetos', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async (): Promise<PortfolioProjeto[]> => {
      const [{ data: projetos, error: errProjetos }, { data: kpis, error: errKpis }] = await Promise.all([
        supabase
          .from('projetos')
          .select('id, nome, cliente, tipo_obra, localizacao, status_geral, latitude, longitude')
          .eq('organizacao_id', organizacaoId!)
          .order('nome'),
        supabase.from('vw_projeto_kpis').select('*'),
      ])
      if (errProjetos) throw errProjetos
      if (errKpis) throw errKpis

      const kpisPorProjeto = new Map(((kpis ?? []) as KpiRow[]).map((k) => [k.projeto_id, k]))

      return ((projetos ?? []) as ProjetoRow[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        cliente: p.cliente,
        tipoObra: p.tipo_obra,
        regiao: p.localizacao,
        statusGeral: (p.status_geral as StatusGeralProjeto) ?? 'em_andamento',
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
        kpis: mapKpiRow(kpisPorProjeto.get(p.id)),
      }))
    },
  })
}

// Força o snapshot a atualizar antes do horário do pg_cron (a cada 5 min) —
// usado pelo botão "Atualizar agora" e pelo Modo Apresentação antes de
// mostrar um slide de dashboard_macro. A função no banco já tem um guard de
// 30s (não re-executa se o último refresh foi recente), então chamar aqui
// sem debounce extra é seguro.
export function useRefreshPortfolioKpis(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_projeto_kpis_sob_demanda')
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio-projetos', organizacaoId] })
    },
  })
}
