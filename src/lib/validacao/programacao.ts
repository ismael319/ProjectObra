// Validação da programação semanal: de-para engenheiro↔usuário e submissões.
//
// Diferente do concreto e do apontamento, aqui o registro validável não existe
// sozinho no banco — ele é criado a partir das atividades da semana. Ver
// 20260810030000_validacao-programacao-migration.sql.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ValidacaoStatus } from './status'

export interface DeParaEngenheiro {
  id: string
  organizacao_id: string
  foreman_nome: string
  usuario_id: string
  criado_em: string
}

export interface SubmissaoProgramacao {
  id: string
  organizacao_id: string
  week_id: string
  engenheiro_usuario_id: string
  foreman_nome: string
  validacao_status: ValidacaoStatus
  criado_em: string
}

export function useDeParaEngenheiros(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['programacao_engenheiros_usuarios', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('programacao_engenheiros_usuarios')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
        .order('foreman_nome')
      if (error) throw error
      return (data as DeParaEngenheiro[]) ?? []
    },
  })
}

/**
 * Nomes de engenheiro que aparecem nas atividades — a lista que precisa ser
 * mapeada.
 *
 * O DISTINCT é feito no client porque o PostgREST não expõe `select distinct`;
 * a consulta traz uma única coluna de texto curto, então o custo é baixo mesmo
 * com milhares de atividades.
 */
export function useForemenDistintos(organizacaoId: string | undefined, projetoId: string | undefined) {
  return useQuery({
    queryKey: ['activities_foremen', organizacaoId, projetoId],
    enabled: !!organizacaoId && !!projetoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('foreman')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .not('foreman', 'is', null)
      if (error) throw error
      const nomes = new Set<string>()
      for (const linha of (data ?? []) as { foreman: string | null }[]) {
        const nome = linha.foreman?.trim()
        if (nome) nomes.add(nome)
      }
      return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    },
  })
}

export function useSalvarDePara(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ foreman_nome, usuario_id }: { foreman_nome: string; usuario_id: string }) => {
      const { error } = await supabase
        .from('programacao_engenheiros_usuarios')
        .upsert(
          { organizacao_id: organizacaoId, foreman_nome, usuario_id },
          { onConflict: 'organizacao_id,foreman_nome' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programacao_engenheiros_usuarios', organizacaoId] })
    },
  })
}

export function useRemoverDePara(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('programacao_engenheiros_usuarios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programacao_engenheiros_usuarios', organizacaoId] })
    },
  })
}

/**
 * Submissões da semana. Sincroniza antes de listar: assim o engenheiro que
 * acabou de receber atividades já aparece, sem precisar de um "enviar para
 * validação" manual.
 */
export function useSubmissoesSemana(weekId: string | undefined) {
  return useQuery({
    queryKey: ['programacao_submissoes', weekId],
    enabled: !!weekId,
    queryFn: async () => {
      // Erro aqui não é fatal: sem a função (migration não aplicada) a lista
      // simplesmente vem do que já existe.
      await supabase.rpc('sincronizar_submissoes_semana', { p_week_id: weekId }).then(
        () => undefined,
        () => undefined,
      )
      const { data, error } = await supabase
        .from('programacao_submissoes')
        .select('*')
        .eq('week_id', weekId!)
        .order('foreman_nome')
      if (error) throw error
      return (data as SubmissaoProgramacao[]) ?? []
    },
  })
}

/** Todas as submissões da semana estão aprovadas? Semana sem submissão = true. */
export async function programacaoProntaParaBloqueio(weekId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('programacao_pronta_para_bloqueio', {
    p_week_id: weekId,
  })
  // Sem a função no banco, não trava o fechamento de semana de quem ainda não
  // usa validação de programação.
  if (error) return true
  return data !== false
}
