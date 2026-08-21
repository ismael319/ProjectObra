// Módulo ativo/inativo POR OBRA — ver
// supabase/migrations/20260821010000_projeto-modulos-desativados-migration.sql.
// Camada de navegação (menu + guard de rota), não trava de dados: a trava de
// verdade por módulo continua sendo só a de organização (user_ve_modulo nas
// RLS). Ausência de linha em projeto_modulos_desativados = módulo ativo
// (herda o que a empresa contratou).
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth-context'
import { useProjects } from './project-store'

export function useProjetoModulosDesativados(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ['projeto_modulos_desativados', projetoId],
    enabled: !!projetoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projeto_modulos_desativados')
        .select('modulo_key')
        .eq('projeto_id', projetoId as string)
      // Sem a migration aplicada (tabela ainda não existe) a tela trata como
      // "nenhum módulo desativado" em vez de quebrar — mesmo padrão já usado
      // em usePendenciasValidacao (src/lib/validacao/validacao-db.ts).
      if (error) return new Set<string>()
      return new Set((data ?? []).map((r) => r.modulo_key as string))
    },
  })
}

/** Módulos visíveis considerando a obra atualmente selecionada — usar em vez
 * de userProfile.modulos cru em qualquer lugar que decida o que aparece
 * DENTRO de uma obra (menu lateral, guard de rota). Sem obra selecionada,
 * devolve o teto contratado pela empresa sem filtro (telas como Portfólio/
 * Apresentação não dependem de obra). */
export function useModulosDaObra(): string[] {
  const { userProfile } = useAuth()
  const { currentProject } = useProjects()
  const { data: desativados } = useProjetoModulosDesativados(currentProject?.id)

  const modulosContratados = userProfile?.modulos ?? []
  if (!currentProject || !desativados || desativados.size === 0) return modulosContratados
  return modulosContratados.filter((m) => !desativados.has(m))
}
