import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Users, Building2, CheckCircle2, Lock, Clock, Sparkles, PackagePlus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import {
  useMeuPlanoAtual,
  useMeusModulosAvulsos,
  useModulosComerciaisAtivos,
  useCatalogoModulosComerciais,
  useUsoFaturavel,
} from '@/lib/modulos-comerciais-db'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  trial: { label: 'Em teste', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  ativo: { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  suspenso: { label: 'Suspenso', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}

function formatMoeda(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return 'Sob consulta'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

function UsoBarra({ label, usado, limite, precoExcedente }: { label: string; usado: number; limite: number | null; precoExcedente: number | null }) {
  const semLimite = limite === null
  const excedeu = !semLimite && usado > limite
  const pct = semLimite ? 0 : Math.min(100, (usado / Math.max(limite, 1)) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className={`text-sm ${excedeu ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
          {usado} {semLimite ? '' : `/ ${limite}`}
        </span>
      </div>
      {!semLimite && (
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${excedeu ? 'bg-amber-500' : 'bg-blue-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {excedeu && precoExcedente !== null && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          {usado - limite} acima do incluso — {formatMoeda(precoExcedente)} cada
        </p>
      )}
    </div>
  )
}

export default function MeuPlano() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const { data: planoAtual, isLoading: carregandoPlano } = useMeuPlanoAtual()
  const { data: avulsos = [] } = useMeusModulosAvulsos()
  const { data: modulosAtivos = {} } = useModulosComerciaisAtivos()
  const { data: catalogo = [] } = useCatalogoModulosComerciais()
  const { data: uso } = useUsoFaturavel()

  const ehPiloto = !!userProfile?.organizacao_piloto
  const statusInfo = planoAtual ? STATUS_LABEL[planoAtual.status] : null
  const avulsosAtivos = avulsos.filter((a) => a.status !== 'cancelado')
  const modulosDisponiveis = catalogo.filter((m) => m.status === 'ativo' || m.status === 'beta')
  const modulosRoadmap = catalogo.filter((m) => m.status === 'planejado')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meu Plano</h1>
      </div>

      {/* Plano atual */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Plano contratado</h2>
        </div>

        {carregandoPlano ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Carregando...</p>
        ) : planoAtual ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl font-bold text-gray-900 dark:text-white">{planoAtual.plano.nome}</span>
              {statusInfo && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.className}`}>{statusInfo.label}</span>
              )}
            </div>
            {planoAtual.plano.descricao && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{planoAtual.plano.descricao}</p>
            )}
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatMoeda(planoAtual.plano.preco_base_mensal)}
              {planoAtual.plano.preco_base_mensal !== null && (
                <span className="text-sm font-normal text-gray-400 dark:text-gray-500">
                  /{planoAtual.ciclo_faturamento === 'anual' ? 'ano' : 'mês'}
                </span>
              )}
            </p>

            {planoAtual.status === 'trial' && planoAtual.trial_fim && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                <Clock size={14} />
                Período de teste até {formatData(planoAtual.trial_fim)}
              </div>
            )}
            {planoAtual.status === 'suspenso' && planoAtual.grace_fim && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <Clock size={14} />
                Acesso de leitura e escrita mantido até {formatData(planoAtual.grace_fim)} — depois disso, só leitura
              </div>
            )}
          </div>
        ) : ehPiloto ? (
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3">
            <Sparkles size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Organização piloto — acesso completo liberado para testes, sem necessidade de um plano contratado.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum plano configurado ainda. Fale com o time SIGA SOLUÇÕES para contratar.
          </p>
        )}
      </div>

      {/* Uso faturável */}
      {planoAtual && uso && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Uso atual</h2>
          </div>
          <UsoBarra
            label="Usuários ativos"
            usado={uso.usuarios_ativos}
            limite={planoAtual.plano.limite_usuarios_incluidos}
            precoExcedente={planoAtual.plano.preco_usuario_excedente}
          />
          <UsoBarra
            label="Obras ativas"
            usado={uso.obras_ativas}
            limite={planoAtual.plano.limite_obras_incluidas}
            precoExcedente={planoAtual.plano.preco_obra_excedente}
          />
        </div>
      )}

      {/* Módulos */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Módulos</h2>
        </div>

        <div className="space-y-2">
          {modulosDisponiveis.map((m) => {
            const nivel = modulosAtivos[m.codigo]
            return (
              <div
                key={m.codigo}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.nome}</p>
                  {m.descricao && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.descricao}</p>}
                </div>
                {nivel === 'leitura_escrita' ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full shrink-0">
                    <CheckCircle2 size={13} /> Ativo
                  </span>
                ) : nivel === 'somente_leitura' ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-full shrink-0">
                    <Lock size={13} /> Somente leitura
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full shrink-0">
                    <Lock size={13} /> Não contratado
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {avulsosAtivos.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Contratados à parte</p>
            <div className="space-y-1.5">
              {avulsosAtivos.map((a) => (
                <div key={a.modulo_codigo} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{a.modulo?.nome ?? a.modulo_codigo}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">desde {formatData(a.data_ativacao)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {modulosRoadmap.length > 0 && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <PackagePlus size={13} /> Em breve
            </p>
            <div className="flex flex-wrap gap-2">
              {modulosRoadmap.map((m) => (
                <span key={m.codigo} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-1 rounded-full">
                  {m.nome}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Quer mudar de plano ou contratar um módulo avulso? Fale com o time SIGA SOLUÇÕES.
      </p>
    </div>
  )
}
