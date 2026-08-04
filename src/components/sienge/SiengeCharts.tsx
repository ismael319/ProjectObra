import { useMemo, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from '@/lib/theme-context'
import type { ItemComClassificacao, TipoRelatorio } from '@/lib/sienge/types'
import { distribuicaoPorCampo, itensPorMes, valorPorCategoria, type CategoriaValor } from '@/lib/sienge/stats'

const PALETA = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']

function useChartTooltipStyle() {
  const { isDark } = useTheme()
  return useMemo(
    () => ({
      borderRadius: 10,
      border: isDark ? '1px solid rgb(55 65 81)' : '1px solid rgb(229 231 235)',
      background: isDark ? '#1f2937' : '#ffffff',
      color: isDark ? '#e5e7eb' : '#111827',
      boxShadow: isDark ? '0 4px 12px -2px rgb(0 0 0 / 0.4)' : '0 4px 12px -2px rgb(15 23 42 / 0.08)',
      fontSize: 12,
    }),
    [isDark]
  )
}

function CardGrafico({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800 p-4">
      <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-3">{titulo}</h4>
      <div className="h-64">{children}</div>
    </div>
  )
}

function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function truncar(texto: string, max = 22): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto
}

function DistribuicaoPie({ dados }: { dados: Array<{ nome: string; total: number }> }) {
  const tooltipStyle = useChartTooltipStyle()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={dados}
          dataKey="total"
          nameKey="nome"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={3}
          isAnimationActive={false}
        >
          {dados.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function TopBarras({ dados, moeda }: { dados: CategoriaValor[]; moeda: boolean }) {
  const tooltipStyle = useChartTooltipStyle()
  const { isDark } = useTheme()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#6b7280' }}
          tickFormatter={(v) => (moeda ? formatarValor(Number(v)) : String(v))}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="nome"
          width={150}
          interval={0}
          tick={{ fontSize: 11, fill: isDark ? '#cbd5e1' : '#374151' }}
          tickFormatter={(v) => truncar(String(v))}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (moeda ? formatarValor(Number(v)) : String(v))} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {dados.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EvolucaoMensal({ dados }: { dados: Array<{ nome: string; total: number }> }) {
  const tooltipStyle = useChartTooltipStyle()
  const { isDark } = useTheme()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" vertical={false} />
        <XAxis dataKey="nome" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#6b7280' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="total" name="Itens" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface Props {
  tipo: TipoRelatorio
  itens: ItemComClassificacao[]
}

/** Painel executivo por aba: distribuição por situação, top fornecedores e evolução mensal. */
export default function SiengeCharts({ tipo, itens }: Props) {
  const comValor = tipo === 'pedidos' || tipo === 'contratos'
  const campoSituacao = tipo === 'contratos' ? 'situacao' : 'sd'
  const campoMoeda = tipo === 'contratos' ? 'saldo' : 'total'
  const campoFornecedor = 'fornecedor' as const

  const distribuicao = useMemo(() => distribuicaoPorCampo(itens, campoSituacao), [itens, campoSituacao])
  const topFornecedores = useMemo(
    () => (comValor ? valorPorCategoria(itens, campoFornecedor, campoMoeda, 8) : []),
    [itens, comValor, campoFornecedor, campoMoeda]
  )
  const mensal = useMemo(() => itensPorMes(itens), [itens])

  const temDados = itens.length > 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <CardGrafico titulo={`Situação (${tipo === 'solicitacoes' ? 'status' : 'situação'})`}>
        {temDados ? (
          <DistribuicaoPie dados={distribuicao} />
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 h-full flex items-center justify-center">Sem dados</p>
        )}
      </CardGrafico>

      {comValor ? (
        <CardGrafico titulo="Top fornecedores por valor">
          {topFornecedores.length > 0 ? (
            <TopBarras dados={topFornecedores} moeda />
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 h-full flex items-center justify-center">Sem dados</p>
          )}
        </CardGrafico>
      ) : (
        <CardGrafico titulo="Abertura por mês">
          {mensal.length > 0 ? (
            <EvolucaoMensal dados={mensal} />
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 h-full flex items-center justify-center">Sem dados</p>
          )}
        </CardGrafico>
      )}

      <CardGrafico titulo="Itens por mês">
        {mensal.length > 0 ? (
          <EvolucaoMensal dados={mensal} />
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 h-full flex items-center justify-center">Sem dados</p>
        )}
      </CardGrafico>
    </div>
  )
}
