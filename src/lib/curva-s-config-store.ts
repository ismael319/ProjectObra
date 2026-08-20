// Acesso ao Supabase pras tabelas de apoio da Curva S por peso
// (curva_s_config, curva_s_feriados, curva_s_semanas) — ver migration
// 20260819010000_curva-s-peso-fundacao-migration.sql. Módulo separado de
// project-store.tsx porque essas tabelas não fazem parte do objeto Project/
// CronogramaInfo já carregado em memória — são específicas da tela de Curva
// S por peso (CurvaSPesoView.tsx) e carregadas sob demanda.
import { supabase } from './supabase'
import { CURVA_S_CONFIG_PADRAO, type CurvaSConfig, type CurvaSResultado } from './curva-s-peso'

export interface CurvaSFeriado {
  id: string
  data: string // ISO yyyy-mm-dd
  descricao: string | null
}

export async function loadCurvaSConfig(projetoId: string): Promise<CurvaSConfig> {
  const { data, error } = await supabase
    .from('curva_s_config')
    .select('dia_corte_semana, dia_folga_semanal')
    .eq('projeto_id', projetoId)
    .maybeSingle()
  if (error || !data) return CURVA_S_CONFIG_PADRAO
  return { diaCorteSemana: data.dia_corte_semana, diaFolgaSemanal: data.dia_folga_semanal }
}

export async function saveCurvaSConfig(projetoId: string, organizacaoId: string, config: CurvaSConfig): Promise<void> {
  const { error } = await supabase.from('curva_s_config').upsert(
    {
      projeto_id: projetoId,
      organizacao_id: organizacaoId,
      dia_corte_semana: config.diaCorteSemana,
      dia_folga_semanal: config.diaFolgaSemanal,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'projeto_id' },
  )
  if (error) throw error
}

export async function loadCurvaSFeriados(projetoId: string): Promise<CurvaSFeriado[]> {
  const { data, error } = await supabase
    .from('curva_s_feriados')
    .select('id, data, descricao')
    .eq('projeto_id', projetoId)
    .order('data', { ascending: true })
  if (error || !data) return []
  return data
}

export async function addCurvaSFeriado(projetoId: string, organizacaoId: string, data: string, descricao: string): Promise<void> {
  const { error } = await supabase.from('curva_s_feriados').insert({
    projeto_id: projetoId,
    organizacao_id: organizacaoId,
    data,
    descricao: descricao.trim() || null,
  })
  if (error) throw error
}

export async function removeCurvaSFeriado(id: string): Promise<void> {
  const { error } = await supabase.from('curva_s_feriados').delete().eq('id', id)
  if (error) throw error
}

/**
 * Regrava o cache semanal calculado (delete + insert, igual ao padrão já
 * usado por save_week_baseline) — os valores nunca mudam retroativamente, só
 * a semana de status avança, então recalcular do zero a cada save é barato e
 * evita lidar com upsert parcial quando a grade de semanas muda de tamanho
 * (reupload de cronograma, mudança de corte semanal etc.).
 */
export async function salvarCurvaSSemanas(projetoId: string, organizacaoId: string, resultados: CurvaSResultado[]): Promise<void> {
  const { error: delError } = await supabase.from('curva_s_semanas').delete().eq('projeto_id', projetoId)
  if (delError) throw delError

  const rows = resultados.flatMap((r) =>
    r.semanas.map((s) => ({
      projeto_id: projetoId,
      organizacao_id: organizacaoId,
      disciplina: r.disciplina,
      semana_indice: s.semanaIndice,
      data_corte: s.dataCorte.toISOString().slice(0, 10),
      avanco_planejado_semana: s.avancoPlanejadoSemana,
      avanco_planejado_acum: s.avancoPlanejadoAcum,
      avanco_executado_semana: s.avancoExecutadoSemana,
      avanco_executado_acum: s.avancoExecutadoAcum,
      forecast_acum: s.forecastAcum,
      desvio_semana: s.desvioSemana,
      desvio_acum: s.desvioAcum,
      calculado_em: new Date().toISOString(),
    })),
  )
  if (rows.length === 0) return
  const { error } = await supabase.from('curva_s_semanas').insert(rows)
  if (error) throw error
}
