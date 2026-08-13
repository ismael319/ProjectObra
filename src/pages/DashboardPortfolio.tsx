import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LayoutGrid, RefreshCw, Loader2, Building2, Users, TrendingUp, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import { usePortfolioProjetos, useRefreshPortfolioKpis, type PortfolioProjeto, type StatusSemaforo, type StatusGeralProjeto } from '@/lib/portfolio-db'

const SEMAFORO_CLASSES: Record<StatusSemaforo, { dot: string; badge: string; hex: string }> = {
  verde: { dot: 'bg-green-500', badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', hex: '#22c55e' },
  amarelo: { dot: 'bg-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', hex: '#f59e0b' },
  vermelho: { dot: 'bg-red-500', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', hex: '#ef4444' },
}

const STATUS_GERAL_LABELS: Record<StatusGeralProjeto, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  paralisado: 'Paralisado',
  concluido: 'Concluído',
}

const SEM_VALOR = '(sem valor)'

function markerIcon(status: StatusSemaforo | 'cinza'): L.DivIcon {
  const cor = status === 'cinza' ? '#9ca3af' : SEMAFORO_CLASSES[status].hex
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${cor};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
}

function Skeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando portfólio</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-gray-200/70 dark:bg-gray-800" />
        ))}
      </div>
    </div>
  )
}

function ProjetoCard({ projeto, onAbrir }: { projeto: PortfolioProjeto; onAbrir: () => void }) {
  const k = projeto.kpis
  const semaforo = k?.statusSemaforo
  const classes = semaforo ? SEMAFORO_CLASSES[semaforo] : null

  return (
    <button
      onClick={onAbrir}
      className="text-left bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-white truncate">{projeto.nome}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{projeto.cliente || SEM_VALOR}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full ${classes?.badge ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${classes?.dot ?? 'bg-gray-400'}`} />
          {semaforo ? semaforo.charAt(0).toUpperCase() + semaforo.slice(1) : 'Sem dados'}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{STATUS_GERAL_LABELS[projeto.statusGeral]}</p>

      {k ? (
        <>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Avanço físico: <strong className="text-gray-900 dark:text-white">{k.avancoFisicoPct}%</strong></span>
              <span>Planejado: {k.avancoPlanejadoPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full relative">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(Math.max(k.avancoFisicoPct, 0), 100)}%` }} />
              <div className="absolute top-0 h-1.5 w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${Math.min(Math.max(k.avancoPlanejadoPct, 0), 100)}%` }} title="Avanço planejado" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{k.ppcUltimaSemana}%</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">PPC</p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{k.efetivoAtual}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Efetivo</p>
            </div>
            <div>
              <p className={`text-sm font-bold tabular-nums ${k.ocorrenciasCriticas > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {k.ocorrenciasAbertas}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Ocorrências</p>
            </div>
          </div>

          {k.restricoesAbertas > 0 && (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{k.restricoesAbertas} restrição(ões) aberta(s) na última semana</p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">Ainda sem indicadores calculados.</p>
      )}
    </button>
  )
}

export default function DashboardPortfolio() {
  const { userProfile } = useAuth()
  const { projects, setCurrentProject } = useProjects()
  const navigate = useNavigate()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const { data: projetos = [], isLoading } = usePortfolioProjetos(organizacaoId)
  const refreshMut = useRefreshPortfolioKpis(organizacaoId)

  const [filtroCliente, setFiltroCliente] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusGeralProjeto>('todos')
  const [filtroRegiao, setFiltroRegiao] = useState('todos')

  const clientes = useMemo(() => [...new Set(projetos.map((p) => p.cliente || SEM_VALOR))].sort(), [projetos])
  const regioes = useMemo(() => [...new Set(projetos.map((p) => p.regiao || SEM_VALOR))].sort(), [projetos])

  const filtrados = useMemo(() => {
    return projetos.filter((p) => {
      if (filtroCliente !== 'todos' && (p.cliente || SEM_VALOR) !== filtroCliente) return false
      if (filtroStatus !== 'todos' && p.statusGeral !== filtroStatus) return false
      if (filtroRegiao !== 'todos' && (p.regiao || SEM_VALOR) !== filtroRegiao) return false
      return true
    })
  }, [projetos, filtroCliente, filtroStatus, filtroRegiao])

  const comCoordenadas = useMemo(() => filtrados.filter((p) => p.latitude != null && p.longitude != null), [filtrados])

  const abrirProjeto = (projetoId: string) => {
    const projeto = projects.find((p) => p.id === projetoId)
    if (!projeto) return
    setCurrentProject(projeto).then((ok) => {
      if (ok) navigate('/dashboard')
    })
  }

  const resumo = useMemo(() => {
    const comKpi = filtrados.filter((p) => p.kpis)
    return {
      total: filtrados.length,
      vermelho: comKpi.filter((p) => p.kpis!.statusSemaforo === 'vermelho').length,
      amarelo: comKpi.filter((p) => p.kpis!.statusSemaforo === 'amarelo').length,
      verde: comKpi.filter((p) => p.kpis!.statusSemaforo === 'verde').length,
      efetivoTotal: comKpi.reduce((s, p) => s + p.kpis!.efetivoAtual, 0),
      ocorrenciasCriticas: comKpi.reduce((s, p) => s + p.kpis!.ocorrenciasCriticas, 0),
    }
  }, [filtrados])

  if (isLoading) return <Skeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-blue-600 dark:text-blue-400" size={22} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portfólio de Projetos</h1>
        </div>
        <button
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
        >
          {refreshMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar agora
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Building2 size={12} /> Projetos</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{resumo.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Users size={12} /> Efetivo total</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{resumo.efetivoTotal}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><TrendingUp size={12} /> Verde / Amarelo / Vermelho</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            <span className="text-green-600 dark:text-green-400">{resumo.verde}</span>
            {' / '}
            <span className="text-amber-600 dark:text-amber-400">{resumo.amarelo}</span>
            {' / '}
            <span className="text-red-600 dark:text-red-400">{resumo.vermelho}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><ShieldAlert size={12} /> Ocorrências críticas</p>
          <p className={`text-xl font-bold ${resumo.ocorrenciasCriticas > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{resumo.ocorrenciasCriticas}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os clientes</option>
          {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as 'todos' | StatusGeralProjeto)}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS_GERAL_LABELS) as StatusGeralProjeto[]).map((s) => (
            <option key={s} value={s}>{STATUS_GERAL_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filtroRegiao}
          onChange={(e) => setFiltroRegiao(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="todos">Todas as regiões</option>
          {regioes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {comCoordenadas.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 h-80">
          <MapContainer
            center={[comCoordenadas[0].latitude!, comCoordenadas[0].longitude!]}
            zoom={5}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {comCoordenadas.map((p) => (
              <Marker
                key={p.id}
                position={[p.latitude!, p.longitude!]}
                icon={markerIcon(p.kpis?.statusSemaforo ?? 'cinza')}
                eventHandlers={{ click: () => abrirProjeto(p.id) }}
              >
                <Popup>
                  <strong>{p.nome}</strong>
                  {p.cliente ? <><br />{p.cliente}</> : null}
                  {p.kpis ? <><br />Avanço: {p.kpis.avancoFisicoPct}% · PPC: {p.kpis.ppcUltimaSemana}%</> : null}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {filtrados.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-12">Nenhum projeto encontrado com esses filtros.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((p) => (
            <ProjetoCard key={p.id} projeto={p} onAbrir={() => abrirProjeto(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
