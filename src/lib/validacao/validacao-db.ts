import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ValidacaoConfirmacao,
  ValidacaoDecisao,
  ValidacaoEntidade,
  ValidacaoEtapa,
} from './status'

export interface ValidacaoResponsavel {
  id: string
  organizacao_id: string
  etapa_id: string
  usuario_id: string
  area_id: string | null
  area_concreto_id: string | null
  criado_em: string
}

export interface UsuarioOrganizacao {
  id: string
  email: string | null
  funcao: string | null
}

export interface AreaOpcao {
  id: string
  nome: string
}

/**
 * As etapas do apontamento e da programação recortam por `areas`; as do
 * concreto recortam por `areas_concreto`. São cadastros diferentes, e a tela de
 * configuração precisa oferecer o conjunto certo pra cada entidade.
 */
export function universoDeArea(entidade: ValidacaoEntidade): 'areas' | 'areas_concreto' {
  return entidade === 'carga_concreto' ? 'areas_concreto' : 'areas'
}

export function useValidacaoEtapas(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['validacao_etapas', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('validacao_etapas')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
        .order('entidade')
        .order('ordem')
      if (error) throw error
      return (data as ValidacaoEtapa[]) ?? []
    },
  })
}

export function useValidacaoResponsaveis(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['validacao_responsaveis', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('validacao_responsaveis')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
      if (error) throw error
      return (data as ValidacaoResponsavel[]) ?? []
    },
  })
}

/** Usuários aprovados da empresa — os candidatos a responsável por uma etapa. */
export function useUsuariosOrganizacao(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['usuarios_organizacao', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, funcao')
        .eq('organizacao_id', organizacaoId!)
        .eq('status_solicitacao', 'aprovado')
        .order('email')
      if (error) throw error
      return (data as UsuarioOrganizacao[]) ?? []
    },
  })
}

export function useAreas(organizacaoId: string | undefined, universo: 'areas' | 'areas_concreto') {
  return useQuery({
    queryKey: [universo, organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      // `areas` é anterior ao multi-tenant e não tem organizacao_id; a RLS já
      // limita o que cada empresa enxerga, então o filtro só vale pro cadastro
      // de concreto.
      let q = supabase.from(universo).select('id, nome').order('nome')
      if (universo === 'areas_concreto') q = q.eq('organizacao_id', organizacaoId!)
      const { data, error } = await q
      if (error) throw error
      return (data as AreaOpcao[]) ?? []
    },
  })
}

export function useAtualizarEtapa(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (etapa: Pick<ValidacaoEtapa, 'id'> & Partial<ValidacaoEtapa>) => {
      const { id, ...campos } = etapa
      const { error } = await supabase.from('validacao_etapas').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validacao_etapas', organizacaoId] })
    },
  })
}

export function useAdicionarResponsavel(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (novo: {
      etapa_id: string
      usuario_id: string
      area_id?: string | null
      area_concreto_id?: string | null
    }) => {
      const { error } = await supabase.from('validacao_responsaveis').insert({
        organizacao_id: organizacaoId,
        etapa_id: novo.etapa_id,
        usuario_id: novo.usuario_id,
        area_id: novo.area_id ?? null,
        area_concreto_id: novo.area_concreto_id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validacao_responsaveis', organizacaoId] })
    },
  })
}

export function useRemoverResponsavel(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('validacao_responsaveis').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validacao_responsaveis', organizacaoId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Confirmações
// ---------------------------------------------------------------------------

/**
 * Todas as decisões já tomadas sobre um conjunto de registros — uma consulta
 * só pra pintar a lista inteira, em vez de uma por linha.
 */
export function useConfirmacoes(entidade: ValidacaoEntidade, registroIds: string[]) {
  // Ordenado pra a queryKey não mudar só porque a lista veio noutra ordem.
  const chave = [...registroIds].sort().join(',')
  return useQuery({
    queryKey: ['validacao_confirmacoes', entidade, chave],
    enabled: registroIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('validacao_confirmacoes')
        .select('*')
        .eq('entidade', entidade)
        .in('registro_id', registroIds)
      if (error) throw error
      return (data as ValidacaoConfirmacao[]) ?? []
    },
  })
}

export interface DecisaoInput {
  entidade: ValidacaoEntidade
  registroIds: string[]
  etapaChave: string
  decisao: ValidacaoDecisao
  observacao?: string | null
}

/**
 * Registra a decisão de uma etapa sobre um ou vários registros de uma vez.
 *
 * `organizacao_id` e `usuario_id` ficam a cargo dos DEFAULT do banco
 * (`user_organizacao()` e `auth.uid()`) — mandar do client seria só uma
 * sugestão que a RLS teria que reconferir de qualquer jeito.
 */
export function useDecidir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entidade, registroIds, etapaChave, decisao, observacao }: DecisaoInput) => {
      const { error } = await supabase.from('validacao_confirmacoes').insert(
        registroIds.map((registro_id) => ({
          entidade,
          registro_id,
          etapa_chave: etapaChave,
          decisao,
          observacao: observacao?.trim() || null,
        })),
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validacao_confirmacoes'] })
      qc.invalidateQueries({ queryKey: ['validacoes_pendentes'] })
      qc.invalidateQueries({ queryKey: ['meus_rejeitados'] })
      qc.invalidateQueries({ queryKey: ['programacao_submissoes'] })
      qc.invalidateQueries({ queryKey: ['cargas-concreto-validacao'] })
      qc.invalidateQueries({ queryKey: ['cargas-concreto-consulta'] })
    },
  })
}

export interface PendenciaValidacao {
  entidade: ValidacaoEntidade
  etapa_chave: string
  etapa_nome: string
  total: number
}

/**
 * O que ainda espera decisão DESTE usuário, agregado por etapa nos três fluxos.
 *
 * Vem de uma RPC porque `validacao_confirmacoes` só registra o que já foi
 * decidido — saber o que falta exige cruzar as três tabelas de origem com as
 * etapas em que a pessoa responde (ver 20260810040000).
 */
export function usePendenciasValidacao(enabled = true) {
  return useQuery({
    queryKey: ['validacoes_pendentes'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minhas_validacoes_pendentes')
      // Sem a migration aplicada a tela mostra "nada pendente" em vez de quebrar.
      if (error) return [] as PendenciaValidacao[]
      return (data as PendenciaValidacao[]) ?? []
    },
  })
}

export interface LancamentoRejeitado {
  entidade: ValidacaoEntidade
  registro_id: string
  identificacao: string
  data_referencia: string
  etapa_nome: string
  motivo: string | null
  rejeitado_por: string
  rejeitado_em: string
}

/**
 * O que ESTE usuário lançou e voltou para correção.
 *
 * Sem isso a rejeição é um beco sem saída: quem rejeita vê o registro vermelho
 * na própria tela, e quem lançou nunca fica sabendo (ver 20260810050000).
 */
export function useMeusRejeitados() {
  return useQuery({
    queryKey: ['meus_rejeitados'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meus_lancamentos_rejeitados')
      if (error) return [] as LancamentoRejeitado[]
      return (data as LancamentoRejeitado[]) ?? []
    },
  })
}

/** Desfaz a própria decisão — a RLS impede mexer na de outra pessoa. */
export function useDesfazerDecisao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('validacao_confirmacoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validacao_confirmacoes'] })
      qc.invalidateQueries({ queryKey: ['validacoes_pendentes'] })
      qc.invalidateQueries({ queryKey: ['meus_rejeitados'] })
      qc.invalidateQueries({ queryKey: ['programacao_submissoes'] })
      qc.invalidateQueries({ queryKey: ['cargas-concreto-validacao'] })
      qc.invalidateQueries({ queryKey: ['cargas-concreto-consulta'] })
    },
  })
}
