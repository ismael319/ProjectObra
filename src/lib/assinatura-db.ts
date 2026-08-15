import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AssinaturaUsuario } from '@/lib/assinatura'

/**
 * Nome, função e estilo de assinatura de todo mundo da própria organização,
 * indexado por id — pra resolver o `usuario_id` de uma confirmação de validação
 * na assinatura de quem a fez.
 *
 * Vem da função `assinaturas_da_organizacao()`, não de um SELECT direto em
 * user_profiles: a policy de leitura de perfis alheios não é garantida pra todo
 * papel, e sem isso a assinatura sumiria justamente pra quem só consulta.
 *
 * Cache longo de propósito: nome e estilo mudam praticamente nunca, e a tela de
 * validação é aberta o dia todo no canteiro — não faz sentido rebuscar isso a
 * cada visita (ver a conversa sobre consumo de banda no plano gratuito).
 */
export function useAssinaturas(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['assinaturas_organizacao', organizacaoId],
    enabled: !!organizacaoId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assinaturas_da_organizacao')
      if (error) throw new Error(error.message)
      const mapa = new Map<string, AssinaturaUsuario>()
      for (const u of (data ?? []) as AssinaturaUsuario[]) mapa.set(u.id, u)
      return mapa
    },
  })
}
