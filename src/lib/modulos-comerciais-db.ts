import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type NivelAcessoComercial = 'leitura_escrita' | 'somente_leitura'

export interface ModuloComercialAtivo {
  modulo_codigo: string
  nivel_acesso: NivelAcessoComercial
}

/**
 * Módulos comerciais (plano + avulsos) que a própria organização tem hoje,
 * já com o nível de acesso resolvido (leitura_escrita | somente_leitura) e o
 * bypass de organização piloto aplicado — vem de meus_modulos_comerciais_ativos(),
 * não de leitura direta nas tabelas de assinatura.
 *
 * Uso típico: `const podeEditar = modulos?.[codigo] === 'leitura_escrita'`.
 */
export function useModulosComerciaisAtivos() {
  return useQuery({
    queryKey: ['modulos_comerciais_ativos'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meus_modulos_comerciais_ativos')
      if (error) throw new Error(error.message)
      const mapa: Record<string, NivelAcessoComercial> = {}
      for (const m of (data ?? []) as ModuloComercialAtivo[]) mapa[m.modulo_codigo] = m.nivel_acesso
      return mapa
    },
  })
}

export interface ModuloComercialCatalogo {
  codigo: string
  nome: string
  categoria: string | null
  descricao: string | null
  tipo_cobranca: string | null
  modulo_rls_key: string | null
  modulo_dependencia_id: string | null
  status: 'ativo' | 'beta' | 'planejado' | 'deprecated'
  ordem_exibicao: number
}

/** Catálogo comercial completo (inclusive itens 'planejado'), para telas de precificação/upgrade. */
export function useCatalogoModulosComerciais() {
  return useQuery({
    queryKey: ['catalogo_modulos_comerciais'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modulos_comerciais')
        .select('codigo, nome, categoria, descricao, tipo_cobranca, modulo_rls_key, modulo_dependencia_id, status, ordem_exibicao')
        .order('ordem_exibicao')
      if (error) throw new Error(error.message)
      return (data ?? []) as ModuloComercialCatalogo[]
    },
  })
}

export interface PlanoComModulos {
  codigo: string
  nome: string
  descricao: string | null
  preco_base_mensal: number | null
  limite_usuarios_incluidos: number | null
  limite_obras_incluidas: number | null
  preco_usuario_excedente: number | null
  preco_obra_excedente: number | null
  custo_implantacao: number | null
  ordem_exibicao: number
  modulos: string[]
}

/**
 * Planos ativos com os códigos dos módulos inclusos — usado na página pública
 * de planos (sem sessão) e em qualquer tela de comparação/upgrade. Lê direto
 * de planos+plano_modulos (leitura liberada pra 'anon' e 'authenticated'),
 * não passa por RPC porque não depende de organização nenhuma.
 */
export function usePlanosComModulos() {
  return useQuery({
    queryKey: ['planos_com_modulos'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos')
        .select('codigo, nome, descricao, preco_base_mensal, limite_usuarios_incluidos, limite_obras_incluidas, preco_usuario_excedente, preco_obra_excedente, custo_implantacao, ordem_exibicao, plano_modulos(modulo_codigo)')
        .eq('status', 'ativo')
        .order('ordem_exibicao')
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown[]).map((row) => {
        const p = row as PlanoComModulos & { plano_modulos: { modulo_codigo: string }[] }
        return { ...p, modulos: (p.plano_modulos ?? []).map((pm) => pm.modulo_codigo) }
      }) as PlanoComModulos[]
    },
  })
}

export interface PlanoInfo {
  codigo: string
  nome: string
  descricao: string | null
  preco_base_mensal: number | null
  limite_usuarios_incluidos: number | null
  limite_obras_incluidas: number | null
  preco_usuario_excedente: number | null
  preco_obra_excedente: number | null
}

export interface OrganizacaoPlanoAtual {
  status: 'trial' | 'ativo' | 'suspenso' | 'cancelado'
  ciclo_faturamento: 'mensal' | 'anual'
  data_inicio: string
  trial_fim: string | null
  grace_fim: string | null
  plano: PlanoInfo
}

/** Linha vigente (data_fim IS NULL) de organizacao_planos da própria organização, já com o plano embutido. */
export function useMeuPlanoAtual() {
  return useQuery({
    queryKey: ['meu_plano_atual'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizacao_planos')
        .select('status, ciclo_faturamento, data_inicio, trial_fim, grace_fim, plano:planos(codigo, nome, descricao, preco_base_mensal, limite_usuarios_incluidos, limite_obras_incluidas, preco_usuario_excedente, preco_obra_excedente)')
        .is('data_fim', null)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const plano = Array.isArray(data.plano) ? data.plano[0] : data.plano
      if (!plano) return null
      return { ...data, plano } as OrganizacaoPlanoAtual
    },
  })
}

export interface ModuloAvulsoContratado {
  modulo_codigo: string
  status: 'ativo' | 'suspenso' | 'cancelado'
  data_ativacao: string
  modulo: { nome: string; categoria: string | null } | null
}

/** Módulos avulsos (qualquer status) contratados pela própria organização, com o nome vindo do catálogo. */
export function useMeusModulosAvulsos() {
  return useQuery({
    queryKey: ['meus_modulos_avulsos'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizacao_modulos_avulsos')
        .select('modulo_codigo, status, data_ativacao, modulo:modulos_comerciais(nome, categoria)')
        .order('data_ativacao', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as { modulo_codigo: string; status: 'ativo' | 'suspenso' | 'cancelado'; data_ativacao: string; modulo: { nome: string; categoria: string | null } | { nome: string; categoria: string | null }[] | null }
        return { ...r, modulo: Array.isArray(r.modulo) ? (r.modulo[0] ?? null) : r.modulo }
      }) as ModuloAvulsoContratado[]
    },
  })
}

export interface UsoFaturavel {
  organizacao_id: string
  usuarios_ativos: number
  obras_ativas: number
  calculado_em: string
}

/** Contagem de usuários/obras ativos usada como base de cobrança, via minha_organizacao_uso_faturavel(). */
export function useUsoFaturavel() {
  return useQuery({
    queryKey: ['uso_faturavel'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('minha_organizacao_uso_faturavel')
      if (error) throw new Error(error.message)
      const linha = (data ?? [])[0] as UsoFaturavel | undefined
      return linha ?? null
    },
  })
}
