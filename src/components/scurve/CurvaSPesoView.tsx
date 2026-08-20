// Curva S por peso atribuído — vista simplificada usada quando o cronograma
// de referência do projeto está configurado com tipoCurvaS === 'peso' (ver
// CronogramaManager.tsx e src/pages/SCurve.tsx). Motor de cálculo em
// src/lib/curva-s-peso.ts; leitura/gravação das tabelas de apoio em
// src/lib/curva-s-config-store.ts.
//
// A edição de dia de corte/folga/feriados NÃO mora mais aqui — ela é lida (só
// leitura, pro cálculo do gráfico) e resumida em texto no rodapé do card. Pra
// editar, é no 2º passo do Upload de Cronograma (quando Tipo de Curva S =
// peso) ou no painel expandido do cronograma em Gerenciar Cronograma — ver
// CurvaSConfigPanel.tsx.
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { calcularCurvaSPorPeso, CURVA_S_CONFIG_PADRAO, CURVA_S_DISCIPLINA_GERAL, DIAS_SEMANA, type CurvaSConfig } from '@/lib/curva-s-peso'
import { loadCurvaSConfig, loadCurvaSFeriados, salvarCurvaSSemanas, type CurvaSFeriado } from '@/lib/curva-s-config-store'
import { COLOR_REAL, COLOR_FORECAST, COLOR_PLANNED } from '@/lib/curve-utils'
import { useAuth } from '@/lib/auth-context'
import type { CronogramaInfo, Project } from '@/lib/project-store'

interface Props {
  project: Project
  /** Cronogramas ativos do projeto (c.ativo) — a função de cálculo já filtra internamente, mas evita recomputar aqui. */
  cronogramas: CronogramaInfo[]
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v}%`
}

function fmtDataCorte(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

export function CurvaSPesoView({ project, cronogramas }: Props) {
  const { userProfile } = useAuth()
  const organizacaoId = userProfile?.organizacao_id ?? undefined

  const [disciplina, setDisciplina] = useState<string>(CURVA_S_DISCIPLINA_GERAL)
  const [config, setConfig] = useState<CurvaSConfig>(CURVA_S_CONFIG_PADRAO)
  const [feriados, setFeriados] = useState<CurvaSFeriado[]>([])
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [showTabela, setShowTabela] = useState(false)

  useEffect(() => {
    let cancelado = false
    setLoadingConfig(true)
    Promise.all([loadCurvaSConfig(project.id), loadCurvaSFeriados(project.id)])
      .then(([cfg, fer]) => {
        if (cancelado) return
        setConfig(cfg)
        setFeriados(fer)
      })
      .catch((err) => {
        console.error('[CurvaSPesoView] Falha ao carregar configuração:', err)
      })
      .finally(() => {
        if (!cancelado) setLoadingConfig(false)
      })
    return () => { cancelado = true }
  }, [project.id])

  const feriadosDatas = useMemo(() => feriados.map((f) => new Date(`${f.data}T00:00:00`)), [feriados])

  const resultados = useMemo(() => {
    if (loadingConfig) return []
    return calcularCurvaSPorPeso({ cronogramas, config, feriados: feriadosDatas })
  }, [cronogramas, config, feriadosDatas, loadingConfig])

  // Regrava o cache semanal (curva_s_semanas) toda vez que o resultado muda —
  // best-effort: se falhar (ex.: usuário sem papel de edição no módulo), a
  // tela continua funcionando normalmente com o cálculo em memória, só não
  // fica disponível pra outras telas/relatórios lerem o cache depois.
  useEffect(() => {
    if (resultados.length === 0 || !organizacaoId) return
    salvarCurvaSSemanas(project.id, organizacaoId, resultados).catch((err) => {
      console.error('[CurvaSPesoView] Falha ao salvar cache semanal (curva_s_semanas):', err)
    })
  }, [resultados, project.id, organizacaoId])

  const grupoAtual = resultados.find((r) => r.disciplina === disciplina) ?? resultados[0]

  const chartData = useMemo(() => {
    if (!grupoAtual) return []
    return grupoAtual.semanas.map((s) => ({
      semana: `S${String(s.semanaIndice).padStart(2, '0')}`,
      Planejado: s.avancoPlanejadoAcum,
      Executado: s.avancoExecutadoAcum,
      Forecast: s.forecastAcum,
    }))
  }, [grupoAtual])

  if (loadingConfig) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando configuração da Curva S...</p>
      </div>
    )
  }

  if (!grupoAtual || grupoAtual.semanas.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={64} />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Sem dados suficientes para a Curva S por peso</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
          Verifique se as atividades do cronograma têm peso atribuído (coluna Número1 do MS Project) e
          datas de linha de base preenchidas.
        </p>
      </div>
    )
  }

  const ultimaSemana = grupoAtual.semanas[grupoAtual.semanas.length - 1]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
            Curva S por Peso Atribuído — {project.nome}
          </h3>
          <div className="flex items-center gap-2">
            {resultados.length > 1 && (
              <select
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value)}
                className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                {resultados.map((r) => (
                  <option key={r.disciplina} value={r.disciplina}>
                    {r.disciplina === CURVA_S_DISCIPLINA_GERAL ? 'Geral (todas as disciplinas)' : r.disciplina}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">Planejado</span>
            <p className="text-xl sm:text-2xl font-bold" style={{ color: COLOR_PLANNED }}>{fmtPct(ultimaSemana.avancoPlanejadoAcum)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">Executado</span>
            <p className="text-xl sm:text-2xl font-bold" style={{ color: COLOR_REAL }}>{fmtPct(ultimaSemana.avancoExecutadoAcum)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">Forecast</span>
            <p className="text-xl sm:text-2xl font-bold" style={{ color: COLOR_FORECAST }}>{fmtPct(ultimaSemana.forecastAcum)}</p>
          </div>
        </div>

        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v) => (v === null || v === undefined ? '—' : `${v}%`)} />
              <Legend />
              <Line type="monotone" dataKey="Planejado" stroke={COLOR_PLANNED} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Executado" stroke={COLOR_REAL} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="Forecast" stroke={COLOR_FORECAST} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Corte semanal: {DIAS_SEMANA[config.diaCorteSemana]} · Folga: {DIAS_SEMANA[config.diaFolgaSemanal]} · {feriados.length} feriado{feriados.length !== 1 ? 's' : ''} cadastrado{feriados.length !== 1 ? 's' : ''}.
          {' '}Pra ajustar, vá em Gerenciar Cronograma.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <button
          onClick={() => setShowTabela((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 sm:px-6"
        >
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Detalhamento semanal</span>
          {showTabela ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {showTabela && (
          <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/30 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Semana</th>
                  <th className="px-3 py-2 text-left font-medium">Data de Corte</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Sem.)</th>
                  <th className="px-3 py-2 text-right font-medium">Planej. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Sem.)</th>
                  <th className="px-3 py-2 text-right font-medium">Exec. (Acum.)</th>
                  <th className="px-3 py-2 text-right font-medium">Forecast</th>
                  <th className="px-3 py-2 text-right font-medium">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {grupoAtual.semanas.map((s) => (
                  <tr key={s.semanaIndice} className="text-gray-700 dark:text-gray-200">
                    <td className="px-3 py-1.5 font-mono">S{String(s.semanaIndice).padStart(2, '0')}</td>
                    <td className="px-3 py-1.5">{fmtDataCorte(s.dataCorte)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtPct(s.avancoPlanejadoSemana)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmtPct(s.avancoPlanejadoAcum)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtPct(s.avancoExecutadoSemana)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: s.avancoExecutadoAcum !== null ? COLOR_REAL : undefined }}>{fmtPct(s.avancoExecutadoAcum)}</td>
                    <td className="px-3 py-1.5 text-right font-medium" style={{ color: s.forecastAcum !== null ? COLOR_FORECAST : undefined }}>{fmtPct(s.forecastAcum)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${s.desvioAcum !== null && s.desvioAcum < 0 ? 'text-red-500' : ''}`}>{fmtPct(s.desvioAcum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
