import { useQuery } from '@tanstack/react-query'
import { Users, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface ResumoApontamento {
  data: string
  registros: number
  pedreiro: number
  servente: number
  carpinteiro: number
  qntdd_funcao: number
  total: number
}

// Antes este card lia `laborEntries` do project-context — um estado que
// nenhuma tela do app popula (addLaborEntry/removeLaborEntry não são
// chamados em lugar nenhum), então sempre mostrava "0 HH apontadas".
// Passou a ler direto de apontamentos_diarios (mesma tabela da tela de
// Apontamento > Dashboard), do dia mais recente com lançamento — headcount
// (nº de pessoas por função), não HH, porque é isso que a tabela guarda.
function useResumoApontamentoRecente(organizacaoId: string | undefined, projetoId: string | undefined) {
  return useQuery({
    queryKey: ['apontamento_resumo_recente', organizacaoId, projetoId],
    enabled: !!organizacaoId && !!projetoId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResumoApontamento | null> => {
      const { data: ultimo, error: errUltimo } = await supabase
        .from('apontamentos_diarios')
        .select('data')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (errUltimo) throw new Error(errUltimo.message)
      if (!ultimo) return null

      const { data: linhas, error } = await supabase
        .from('apontamentos_diarios')
        .select('pedreiro, servente, carpinteiro, qntdd_funcao, total')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .eq('data', ultimo.data)
      if (error) throw new Error(error.message)

      const acc = { pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0 }
      for (const l of linhas ?? []) {
        acc.pedreiro += l.pedreiro ?? 0
        acc.servente += l.servente ?? 0
        acc.carpinteiro += l.carpinteiro ?? 0
        acc.qntdd_funcao += l.qntdd_funcao ?? 0
        acc.total += l.total ?? 0
      }
      return { data: ultimo.data, registros: linhas?.length ?? 0, ...acc }
    },
  })
}

function formatarData(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function WorkforceSummary({ projetoId }: { projetoId: string | undefined }) {
  const { userProfile } = useAuth()
  const { data: resumo, isLoading } = useResumoApontamentoRecente(userProfile?.organizacao_id, projetoId)

  const funcoes = resumo
    ? [
        { name: 'Pedreiro', qtd: resumo.pedreiro },
        { name: 'Servente', qtd: resumo.servente },
        { name: 'Carpinteiro', qtd: resumo.carpinteiro },
        { name: 'Outras funções', qtd: resumo.qntdd_funcao },
      ].filter((f) => f.qtd > 0)
    : []
  const maxQtd = Math.max(1, ...funcoes.map((f) => f.qtd))

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-700 dark:bg-gray-800 sm:rounded-xl sm:p-6 sm:shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Users size={18} className="text-amber-600 dark:text-amber-400" />
        <h2 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">Apontamento de Mão de Obra</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-gray-300" />
        </div>
      ) : !resumo ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum apontamento registrado ainda para este projeto.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 content-start">
            <div>
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{resumo.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pessoas em {formatarData(resumo.data)}</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{resumo.registros}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Registros no dia</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 dark:border-gray-700 sm:border-t-0 sm:pt-0 lg:col-span-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Por função</h3>
            {funcoes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sem detalhamento por função nesse dia.</p>
            ) : (
              <div className="space-y-2.5">
                {funcoes.map((f) => (
                  <div key={f.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300">{f.name}</span>
                      <span className="shrink-0 text-gray-400 dark:text-gray-500">{f.qtd}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                      <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${(f.qtd / maxQtd) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
